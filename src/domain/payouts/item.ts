/**
 * Changing what an item pays (spec, Billing > Payouts: "unless Admin Platform
 * overrides it after a Keluhan with a note. A Harga Khusus is borne by the
 * Operator ... unless a partner share is recorded"; ticket 32's AC 1).
 *
 * Three rules can lower an item, and all three leave the issued amount alone:
 * - **after a Keluhan**, Admin Platform sets what this item pays, with a note
 *   (e.g. half). This is a person's decision, so it is audited here.
 * - **a partner share** the Lokasi Mitra agreed to bear on the order, and a
 *   **refund netted from the partner**: a sum to take off an order's items,
 *   oldest first. Both are entered by another module (tickets 30 and 31) inside
 *   that module's own staff write, which records its own Entri Audit: this is
 *   part of that write, not a second one.
 * - **a full refund to the Pelanggan** cancels the items outright rather than
 *   paying them and clawing the money back (the owner's decision, recorded in
 *   the ticket's Comments).
 *
 * The issued amount is never rewritten. A Tagihan is immutable once issued and
 * the family has seen it, so what changed is only what the Operator will pay —
 * which is why the adjustment is its own column and the Bukti Pencairan states
 * both the amount and, through the item, the note behind it.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { pencairanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { rupiahSchema } from "@/lib/rupiah";
import { sumRupiah, type Rupiah } from "@/lib/rupiah";
import type { Clock } from "@/ports/clock";
import { sisipPotongan } from "./potongan";
import { jumlahOf, toBarisItem, type BarisItemPencairan } from "./baca";
import { pencairanItem, pencairanPenguranganTertunda, pencairanTerencana, type PencairanItemBatalReason, type PencairanItemReason } from "./schema";

const CATATAN_MAX = 500;
const nomorPemesananSchema = z.string().trim().regex(/^MKM-\d{4}-\d{6}$/);

export interface ItemDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

export type TurunkanJumlahResult =
  | { ok: true; item: BarisItemPencairan }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "sudah_dicairkan" }
  /** The new amount is above what the item was issued for: an override lowers what is paid, never raises it. */
  | { ok: false; reason: "melebihi_tarif" }
  /** The new amount was Rp 0, above the largest amount, or the note was missing. */
  | { ok: false; reason: "input_tidak_valid" };

/**
 * Admin Platform overrides what one item pays after a Keluhan, with the note the
 * rule requires (spec, story 158: "override the fulfiller's Pencairan amount
 * with a note (e.g. half)"). Audited. Refused for an item that has already been
 * transferred, because that money is gone.
 *
 * A new amount of Rp 0 is refused: an item pays nothing by being **cancelled**,
 * which the Refunds module's path does, never by being transferred as Rp 0.
 */
export async function turunkanJumlahPencairan(
  deps: ItemDeps,
  by: Actor,
  input: { itemId: string; amount: number; catatan: string },
  within?: Database,
): Promise<TurunkanJumlahResult> {
  const refusal = writeRefusal(by, "pencairan.kelola", pencairanResource());
  if (refusal) return refusal;
  const parsed = z
    .object({ itemId: z.uuid(), amount: rupiahSchema, catatan: z.string().trim().min(1).max(CATATAN_MAX) })
    .safeParse(input);
  if (!parsed.success || parsed.data.amount === 0) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();
  // `within` is the caller's own transaction, so a decision that depends on this override commits with it.
  return deps.audit.staffWrite(within ?? deps.db, async (tx, record) => {
    const [row] = await tx.select().from(pencairanItem).where(eq(pencairanItem.id, parsed.data.itemId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    if (row.status === "dicairkan" || row.status === "dibatalkan") return { ok: false, reason: "sudah_dicairkan" } as const;
    // Payouts' own rule, checked under the row lock: the issued amount is a ceiling.
    if (parsed.data.amount > row.amount) return { ok: false, reason: "melebihi_tarif" } as const;
    await tx
      .update(pencairanItem)
      .set({
        jumlahDisesuaikan: parsed.data.amount as Rupiah,
        alasanPenyesuaian: "setelah_keluhan",
        catatanPenyesuaian: parsed.data.catatan,
        disesuaikanOleh: by.accountId,
        disesuaikanPada: now,
      })
      .where(eq(pencairanItem.id, row.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pencairan.override_jumlah",
      entity: { kind: "pencairan_item", id: row.id },
      lokasiId: row.lokasiId,
      before: { amount: jumlahOf(row), alasan: row.alasanPenyesuaian, catatan: row.catatanPenyesuaian },
      after: { amount: parsed.data.amount, alasan: "setelah_keluhan", catatan: parsed.data.catatan },
      reason: parsed.data.catatan,
    });
    const [setelah] = await tx.select().from(pencairanItem).where(eq(pencairanItem.id, row.id));
    return { ok: true, item: toBarisItem(setelah) } as const;
  });
}

export type KurangiPesananResult =
  | { ok: true; items: { id: string; dari: Rupiah; jadi: Rupiah }[]; total: Rupiah }
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "input_tidak_valid" }
  /** The sum is more than the order's unpaid items come to: a share cannot be larger than what is owed. */
  | { ok: false; reason: "melebihi_pencairan_pesanan" };

/**
 * Takes `amount` off what one order's items of one Lokasi Mitra pay, oldest
 * item first, so a partner share (ticket 30) or a refund netted from the partner
 * (ticket 31) lowers that order's Pencairan by exactly that much.
 *
 * **The caller runs this inside its own transaction** — it is part of that
 * module's staff write, which records the Entri Audit for the decision; Payouts
 * records none of its own here, so the Audit Log has one entry for one decision.
 *
 * An item the sum empties completely is **cancelled** rather than left at Rp 0
 * (a Bukti Pencairan cannot carry a Rp 0 line, and an item nothing is owed for
 * does not belong in a run); a sum larger than the order's unpaid items is
 * refused outright.
 */
export async function kurangiPencairanPesanan(
  tx: Database,
  input: {
    nomorPemesanan: string;
    /** The Lokasi Mitra whose items are lowered; another Lokasi's items are never touched. */
    lokasiId: string;
    amount: number;
    /** Which rule is taking it: the partner share, or a refund netted from the partner. */
    alasan: Extract<PencairanItemReason, "porsi_pemegang_saham" | "pengembalian_dana">;
    catatan: string;
    oleh: string;
  },
  now: Date,
): Promise<KurangiPesananResult> {
  const parsed = z
    .object({
      nomorPemesanan: nomorPemesananSchema,
      lokasiId: z.string().trim().min(1).max(64),
      amount: rupiahSchema,
      alasan: z.enum(["porsi_pemegang_saham", "pengembalian_dana"]),
      catatan: z.string().trim().min(1).max(CATATAN_MAX),
      oleh: z.string().trim().min(1).max(64),
    })
    .safeParse(input);
  if (!parsed.success || parsed.data.amount === 0) return { ok: false, reason: "input_tidak_valid" };
  const items = await tx
    .select()
    .from(pencairanItem)
    .where(
      and(
        eq(pencairanItem.nomorPemesanan, parsed.data.nomorPemesanan),
        eq(pencairanItem.lokasiId, parsed.data.lokasiId),
        inArray(pencairanItem.status, ["belum_jatuh_tempo", "jatuh_tempo"]),
      ),
    )
    // The order's own line order (the issued Tagihan line each item came from),
    // so the share always comes off the Hak Pakai first rather than off whichever
    // row the database happens to hand back first.
    .orderBy(asc(pencairanItem.tagihanPosisi), asc(pencairanItem.id))
    .for("update");
  if (items.length === 0) return { ok: false, reason: "tidak_ditemukan" };
  const total = sumRupiah(items.map((item) => jumlahOf(item)));
  if (!total.ok) return { ok: false, reason: "input_tidak_valid" };
  if (parsed.data.amount > total.amount) return { ok: false, reason: "melebihi_pencairan_pesanan" };

  let sisa = parsed.data.amount as Rupiah;
  const diubah: { id: string; dari: Rupiah; jadi: Rupiah }[] = [];
  for (const item of items) {
    if (sisa <= 0) break;
    const dari = jumlahOf(item);
    // An item smaller than what is left is emptied and cancelled, and the rest
    // moves on to the next one, so a share never leaves a Rp 0 line behind.
    const dipotong = Math.min(dari, sisa) as Rupiah;
    const jadi = (dari - dipotong) as Rupiah;
    if (dipotong === 0) continue;
    sisa = (sisa - dipotong) as Rupiah;
    // Nothing is owed for an item the sum empties, so it leaves the run for good
    // instead of waiting there as an Rp 0 line no Bukti Pencairan could carry.
    await tx
      .update(pencairanItem)
      .set(
        jadi === 0
          ? { status: "dibatalkan", batalAlasan: "telah_ditanggung", batalPada: now }
          : {
              jumlahDisesuaikan: jadi,
              alasanPenyesuaian: parsed.data.alasan,
              catatanPenyesuaian: parsed.data.catatan,
              disesuaikanOleh: parsed.data.oleh,
              disesuaikanPada: now,
            },
      )
      .where(eq(pencairanItem.id, item.id));
    diubah.push({ id: item.id, dari, jadi });
  }
  return { ok: true, items: diubah, total: parsed.data.amount as Rupiah };
}

export type KurangiSebisanyaResult =
  | { ok: true; /** Taken off items that exist now. */ dikurangi: number; /** Kept to lower the items when they are made (a Terencana order still inside its Masa Pembatalan). */ ditunda: number; /** What no unpaid item could cover: money already paid out, for the caller to claim back. */ sisa: number }
  | { ok: false; reason: "input_tidak_valid" };

/**
 * A refund netted from the partner, **as far as the unpaid items reach** (ticket 38): `kurangiPencairanPesanan` refuses a
 * sum larger than what is still unpaid, and a refund that only partly fits must not be refused whole, or the Lokasi Mitra
 * is paid for the part that fits and charged for it again. So the unpaid items are lowered by as much as they can cover
 * (oldest first, an emptied one cancelled), and whatever is left over is either
 * - **kept for the items still to come**, when the order has none at all yet but a Terencana Masa Pembatalan is running
 *   (the tick lowers them as it makes them), or
 * - **returned as `sisa`**: it was already paid out, and the caller turns it into a Potongan.
 * The caller runs this inside its own transaction, like `kurangiPencairanPesanan`.
 */
export async function kurangiPencairanSebisanya(
  tx: Database,
  input: { nomorPemesanan: string; lokasiId: string; amount: number; catatan: string; oleh: string },
  now: Date,
): Promise<KurangiSebisanyaResult> {
  const parsed = z
    .object({
      nomorPemesanan: nomorPemesananSchema,
      lokasiId: z.string().trim().min(1).max(64),
      amount: rupiahSchema,
      catatan: z.string().trim().min(1).max(CATATAN_MAX),
      oleh: z.string().trim().min(1).max(64),
    })
    .safeParse(input);
  if (!parsed.success || parsed.data.amount === 0) return { ok: false, reason: "input_tidak_valid" };
  const data = parsed.data;
  const semua = await tx
    .select()
    .from(pencairanItem)
    .where(and(eq(pencairanItem.nomorPemesanan, data.nomorPemesanan), eq(pencairanItem.lokasiId, data.lokasiId)))
    .for("update");
  const belumDibayar = semua.filter((item) => item.status === "belum_jatuh_tempo" || item.status === "jatuh_tempo");
  const total = sumRupiah(belumDibayar.map((item) => jumlahOf(item)));
  if (!total.ok) return { ok: false, reason: "input_tidak_valid" };
  const bisa = Math.min(data.amount, total.amount);
  if (bisa > 0) {
    const dikurangi = await kurangiPencairanPesanan(tx, { ...data, amount: bisa, alasan: "pengembalian_dana" }, now);
    if (!dikurangi.ok) return { ok: false, reason: "input_tidak_valid" };
  }
  const sisa = data.amount - bisa;
  if (sisa === 0) return { ok: true, dikurangi: bisa, ditunda: 0, sisa: 0 };
  const menunggu = semua.length === 0 && (await tx.select({ n: pencairanTerencana.nomorPemesanan }).from(pencairanTerencana).where(eq(pencairanTerencana.nomorPemesanan, data.nomorPemesanan))).length > 0;
  if (!menunggu) return { ok: true, dikurangi: bisa, ditunda: 0, sisa };
  await tx.insert(pencairanPenguranganTertunda).values({
    nomorPemesanan: data.nomorPemesanan,
    lokasiId: data.lokasiId,
    amount: sisa as Rupiah,
    catatan: data.catatan,
    oleh: data.oleh,
    dibuatPada: now,
  });
  return { ok: true, dikurangi: bisa, ditunda: sisa, sisa: 0 };
}

/**
 * Lowers an order's freshly made items by the refunds that were netted before they existed, then forgets them. Called by
 * the trigger inside the transaction that makes the items, so the two are never seen apart.
 */
export async function terapkanPenguranganTertunda(tx: Database, nomorPemesanan: string, now: Date): Promise<void> {
  const menunggu = await tx.select().from(pencairanPenguranganTertunda).where(eq(pencairanPenguranganTertunda.nomorPemesanan, nomorPemesanan)).for("update");
  for (const satu of menunggu) {
    const unpaid = await tx
      .select()
      .from(pencairanItem)
      .where(and(eq(pencairanItem.nomorPemesanan, nomorPemesanan), eq(pencairanItem.lokasiId, satu.lokasiId), inArray(pencairanItem.status, ["belum_jatuh_tempo", "jatuh_tempo"])));
    const total = sumRupiah(unpaid.map((item) => jumlahOf(item)));
    const bisa = total.ok ? Math.min(satu.amount, total.amount) : 0;
    if (bisa > 0) {
      await kurangiPencairanPesanan(tx, { nomorPemesanan, lokasiId: satu.lokasiId, amount: bisa, alasan: "pengembalian_dana", catatan: satu.catatan, oleh: satu.oleh }, now);
    }
    // What the items just made cannot cover (a Harga Khusus share already took part of them) was never going to be paid to the
    // Lokasi Mitra by these items, yet the family has been refunded it: it is a Potongan, not a rupiah lost.
    const sisa = satu.amount - bisa;
    if (sisa > 0) {
      await sisipPotongan(
        tx,
        {
          lokasiId: satu.lokasiId,
          amount: sisa,
          alasanKind: "pengembalian_dana",
          alasan: `Pengembalian dana untuk pesanan ${nomorPemesanan} melebihi Pencairan yang tersedia untuk dikurangi.`,
          sumberNomorPemesanan: nomorPemesanan,
        },
        now,
      );
    }
    await tx.delete(pencairanPenguranganTertunda).where(eq(pencairanPenguranganTertunda.id, satu.id));
  }
}

export type BatalkanTagihanResult = { ok: true; dibatalkan: string[] } | { ok: false; reason: "input_tidak_valid" };

/**
 * Cancels the Pencairan items of a Tagihan whose money was returned to the
 * Pelanggan in full: the work is not paid for, and nothing is clawed back
 * afterwards (the owner's decision, recorded in the ticket's Comments).
 *
 * **The Refunds module (ticket 31) calls this inside its own transaction**, in
 * the same write that records the refund, so the two cannot disagree. An item
 * that was already transferred is left exactly as it is — that money is gone,
 * and clawing it back is a Potongan, which is a decision of its own.
 */
export async function batalkanPencairanTagihan(
  tx: Database,
  input: { tagihanId: string; alasan: Extract<PencairanItemBatalReason, "dikembalikan_penuh"> },
  now: Date,
): Promise<BatalkanTagihanResult> {
  if (!z.uuid().safeParse(input.tagihanId).success) return { ok: false, reason: "input_tidak_valid" };
  const dibatalkan = await tx
    .update(pencairanItem)
    .set({ status: "dibatalkan", batalAlasan: input.alasan, batalPada: now })
    .where(and(eq(pencairanItem.tagihanId, input.tagihanId), inArray(pencairanItem.status, ["belum_jatuh_tempo", "jatuh_tempo"])))
    .returning({ id: pencairanItem.id });
  return { ok: true, dibatalkan: dibatalkan.map((row) => row.id) };
}

export type BatalkanItemResult = { ok: true } | { ok: false; reason: "tidak_ditemukan" };

/**
 * Cancels one Pencairan item that has not been transferred, by id (a Mitra Jasa job redone by
 * another Mitra Jasa: the original Pencairan is cancelled, spec Layanan > Mitra Jasa pay; ticket 57).
 * An item already due is cancelled too; one already transferred or cancelled is left as it is.
 */
export async function batalkanItem(
  tx: Database,
  input: { itemId: string; alasan: Extract<PencairanItemBatalReason, "diganti_pelaksana"> },
  now: Date,
): Promise<BatalkanItemResult> {
  if (!z.uuid().safeParse(input.itemId).success) return { ok: false, reason: "tidak_ditemukan" };
  const hasil = await tx
    .update(pencairanItem)
    .set({ status: "dibatalkan", batalAlasan: input.alasan, batalPada: now })
    .where(and(eq(pencairanItem.id, input.itemId), inArray(pencairanItem.status, ["belum_jatuh_tempo", "jatuh_tempo"])))
    .returning({ id: pencairanItem.id });
  return hasil.length > 0 ? { ok: true } : { ok: false, reason: "tidak_ditemukan" };
}

export type CatatLayananMitraJasaResult = { ok: true; id: string } | { ok: false; reason: "input_tidak_valid" };

/**
 * Records one Pencairan item for a Mitra Jasa's job, with the four things a
 * Mitra Jasa may see about it (job, Layanan, date, rate) copied onto the item.
 *
 * **The Layanan module (ticket 51) calls this inside its own transaction** when
 * the job's own Keluhan window closes — that is when a job's Pencairan becomes
 * due (spec, Pencairan items) — and the job's own state machine stays its
 * business. Everything a Mitra Jasa is not allowed to see stays out of the item:
 * there is no order number and no family on it.
 */
export async function catatItemLayananMitraJasa(
  tx: Database,
  input: {
    /** The Mitra Jasa's Akun: the role's holder, never a partnership. */
    akunId: string;
    nama: string;
    /** The Lokasi Mitra the order is at, when there is one; a TPU job has none. */
    lokasiId: string | null;
    /** The job's own reference, as the Layanan module names it. */
    pekerjaan: string;
    /** The Layanan's name, as the family's order reads it. */
    layanan: string | null;
    /** The TPU the job is done at, as its Mitra Jasa reads it on their Pencairan; none for a job that is not at a TPU. */
    tpu?: string | null;
    /** The target date (WIB "YYYY-MM-DD"). */
    tanggal: string | null;
    /** The Mitra Jasa rate, whole rupiah and positive. */
    tarif: number;
    /** The order it belongs to, when there is one; never shown to the Mitra Jasa. */
    nomorPemesanan?: string | null;
    /** The Label the Bukti Pencairan repeats. */
    label?: string;
    /**
     * The earliest the job's Pencairan can fall due: when its Keluhan window ends, which only the Layanan module knows.
     * The Mitra Jasa is shown it as the date to expect; the item falls due only when the module says so (`itemJatuhTempo`).
     */
    jatuhTempoPalingCepat?: Date | null;
  },
  now: Date,
): Promise<CatatLayananMitraJasaResult> {
  const parsed = z
    .object({
      akunId: z.string().trim().min(1).max(64),
      nama: z.string().trim().min(1).max(300),
      lokasiId: z.string().trim().min(1).max(64).nullable(),
      pekerjaan: z.string().trim().min(1).max(300),
      layanan: z.string().trim().min(1).max(300).nullable(),
      tpu: z.string().trim().min(1).max(300).nullish(),
      tanggal: z.iso.date().nullable(),
      tarif: rupiahSchema,
      nomorPemesanan: nomorPemesananSchema.nullish(),
      label: z.string().trim().min(1).max(300).optional(),
      jatuhTempoPalingCepat: z.date().nullish(),
    })
    .safeParse(input);
  if (!parsed.success || parsed.data.tarif === 0) return { ok: false, reason: "input_tidak_valid" };
  const [row] = await tx
    .insert(pencairanItem)
    .values({
      penerimaKind: "mitra_jasa",
      lokasiId: parsed.data.lokasiId,
      penerimaNama: parsed.data.nama,
      penerimaAkunId: parsed.data.akunId,
      kind: "layanan",
      label: parsed.data.label ?? parsed.data.layanan ?? parsed.data.pekerjaan,
      amount: parsed.data.tarif as Rupiah,
      nomorPemesanan: parsed.data.nomorPemesanan ?? null,
      tanggalLayanan: parsed.data.tanggal,
      pekerjaanLabel: parsed.data.pekerjaan,
      layananNama: parsed.data.layanan,
      tpuNama: parsed.data.tpu ?? null,
      // Not due yet: the Layanan module's own Keluhan window closing is what makes
      // it due, and when that happens is not this module's to guess.
      dueAt: null,
      jatuhTempoAt: null,
      jatuhTempoPalingCepatAt: parsed.data.jatuhTempoPalingCepat ?? null,
      status: "belum_jatuh_tempo",
      dibuatPada: now,
    })
    .returning({ id: pencairanItem.id });
  return { ok: true, id: row.id };
}

/**
 * Moves a job's item from not due to due, stamping the 2 Hari Kerja deadline on
 * the Admin Platform calendar. This is what the Layanan module (ticket 51) calls
 * in its own transaction when the job's Keluhan window closes, which is the
 * moment the spec says a job's Pencairan becomes due. One-way: an item that is
 * already due, cancelled or transferred is left alone.
 */
export async function itemJatuhTempo(
  tx: Database,
  itemId: string,
  input: { now: Date; jatuhTempoAt: Date },
): Promise<{ ok: true } | { ok: false; reason: "tidak_ditemukan" }> {
  const moved = await tx
    .update(pencairanItem)
    .set({ status: "jatuh_tempo", dueAt: input.now, jatuhTempoAt: input.jatuhTempoAt })
    .where(and(eq(pencairanItem.id, itemId), isNull(pencairanItem.dueAt), eq(pencairanItem.status, "belum_jatuh_tempo")))
    .returning({ id: pencairanItem.id });
  return moved.length > 0 ? { ok: true } : { ok: false, reason: "tidak_ditemukan" };
}
