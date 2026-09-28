/**
 * The Lokasi Mitra's answer to a Pemesanan Terencana (spec, Pemesanan > Terencana;
 * ticket 37). Three steps, each one for the actor the spec names, each one a single
 * transaction so an order can never sit half-moved:
 *
 * - **Konfirmasi** (`konfirmasiTerencana`): the order becomes Dikonfirmasi and a
 *   **pay-first** Tagihan is issued, due when the payment hold ends. The hold's end is
 *   the Lokasi Mitra's own policy (`terencanaHoldHours`, 24 h by default) counted from
 *   the confirmation — not from the submission, which is when the *plots* were held and
 *   when the confirmation itself was due. No Hak Pakai yet: the right is granted on
 *   payment (`./tick-terencana.ts`), which is what "pay-first in full" means.
 * - **Tolak** (`tolakTerencana`): Ditolak, the reason kept, the plots released, and the
 *   family sent back to the wizard's Lokasi step (story 49).
 * - **Tarik** (`tarikTerencana`): the Pemesan's own free withdrawal before paying
 *   (story 47) — Dibatalkan, the plots released, and nothing charged, which is free by
 *   construction: a Terencana Tagihan is issued only at the confirmation, and this step
 *   voids it, so there is never any money to return.
 *
 * Only that Lokasi's own Admin Lokasi may confirm or decline (the check is the one
 * `konfirmasiSaatDuka` makes); any Pemesan may withdraw, and the module checks the
 * order is theirs so a caller cannot pass someone else's. Admin Platform may chase
 * the Lokasi by phone (the Tier 3 "Konfirmasi Terencana terlambat" row) but never
 * answer for it.
 */
import { and, eq, isNotNull, lte } from "drizzle-orm";
import { z } from "zod";
import { refusable } from "@/db/unit-of-work";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { quoteLineLabel } from "@/lib/quote-line-label";
import type { NewTagihanLine } from "@/domain/billing";
import type { QuotedLine } from "@/domain/tariffs";
import type { PemesananDeps } from "./deps";
import { pemesananTerencana, pemesananTerencanaUnit } from "./schema";

/** The wording a lapse leaves on the order (spec, Pemesanan > Terencana: reason "batas pembayaran lewat"). */
export const ALASAN_BATAS_PEMBAYARAN_LEWAT = "batas pembayaran lewat";
/** The wording a withdrawal leaves on the order; the spec gives a withdrawal no other reason. */
export const ALASAN_DITARIK_PEMESAN = "ditarik Pemesan sebelum membayar";

/** What the Admin Lokasi's confirm form sends: which order. */
export const konfirmasiTerencanaSchema = z.object({ nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/) });
export type KonfirmasiTerencanaInput = z.infer<typeof konfirmasiTerencanaSchema>;

/** What a decline sends: the order and why, in the Admin Lokasi's own words. */
export const tolakTerencanaSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  alasan: z.string().trim().min(1).max(300),
});
export type TolakTerencanaInput = z.infer<typeof tolakTerencanaSchema>;

/** What a withdrawal sends: only the order; the Pemesan owes no reason (story 47). */
export const tarikTerencanaSchema = z.object({ nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/) });
export type TarikTerencanaInput = z.infer<typeof tarikTerencanaSchema>;

/** The state an order is left in, as the family, the queue and a test all read it. */
export interface TerencanaPindah {
  nomor: string;
  status: "dikonfirmasi" | "ditolak" | "dibatalkan";
  alasan: string | null;
  /** On a confirmation: the pay-first Tagihan, whose `dueAt` **is** the hold's end. Null otherwise. */
  tagihan: { id: string; nomorTagihan: string; total: number; dueAt: Date; link: string } | null;
  /** How many plots this step released, so a screen and a test can both see the hold go. */
  plotsDirilis: number;
}

/** The refusals a staff step answers with: the role check is `WriteRefusal`'s. */
export type TerencanaRefusal =
  | { ok: false; reason: "input_tidak_valid" }
  /** No order of that Nomor Pemesanan. */
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  /** The order has ended (Ditolak or Dibatalkan) or another answer already moved it: there is nothing to do. */
  | { ok: false; reason: "pesanan_sudah_ditutup" }
  /** The Lokasi Mitra is not there any more, so its hold cannot be read. */
  | { ok: false; reason: "lokasi_tidak_ada" }
  /** The chosen plots can no longer be priced, or a line kind this flow may not bill. */
  | { ok: false; reason: "harga_tidak_tersedia" }
  /** A Tagihan could not be issued (no Pengaturan Operator, a total past the cap): nothing at all is written. */
  | { ok: false; reason: "tagihan_tidak_terbit" };

/** The same for a withdrawal, which is the Pemesan's own order and never a staff write. */
export type TarikTerencanaRefusal =
  | { ok: false; reason: "input_tidak_valid" }
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  | { ok: false; reason: "pesanan_sudah_ditutup" }
  /** The order is `aktif`: the money is in and the Hak Pakai exists, so this is a Pembatalan (ticket 38). */
  | { ok: false; reason: "sudah_dibayar" };

export type KonfirmasiTerencanaResult = ({ ok: true } & TerencanaPindah) | WriteRefusal | TerencanaRefusal;
export type TolakTerencanaResult = ({ ok: true } & TerencanaPindah) | WriteRefusal | TerencanaRefusal;
export type TarikTerencanaResult = ({ ok: true } & TerencanaPindah) | TarikTerencanaRefusal;

/** The deadline a Terencairan row carries (spec, Work Queues: "Lainnya: Konfirmasi Terencana"). */
export interface TerencanaAntrean {
  id: string;
  nomor: string;
  lokasi: { id: string; name: string };
  pemesan: { name: string; phoneNumber: string | null };
  /** The plots it holds, by the numbers the family knows them by. */
  unit: { jenis: "petak" | "kavling"; nomor: string }[];
  calon: { name: string };
  /**
   * The end of the Lokasi's **next working day** counted from submission: the Lokasi's
   * own calendar, so a closed weekday or a Tanggal Tutup moves it (spec, Lokasi: an
   * Admin Lokasi's working day is an open day of its Jam Operasional). Null while the
   * order's deadline could not be computed at submission, which happens only for a
   * Lokasi Mitra whose Jam Operasional belum diisi — and such a Lokasi is not listed, so
   * it never gets a Terencairan order in the first place.
   */
  konfirmasiDueAt: Date | null;
  diajukanAt: Date;
}

type AntreanRow = typeof pemesananTerencana.$inferSelect;

/** Every Terencairan order of one Lokasi Mitra still waiting for its confirmation, oldest first. */
export async function antreanKonfirmasiTerencana(deps: Pick<PemesananDeps, "db">, lokasiId: string): Promise<TerencanaAntrean[]> {
  const orders = await deps.db
    .select()
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.lokasiId, lokasiId), eq(pemesananTerencana.status, "diajukan")))
    .orderBy(pemesananTerencana.diajukanAt, pemesananTerencana.nomor);
  return Promise.all(orders.map((order) => toAntrean(deps, order)));
}

/**
 * Every Terencairan order still waiting past the deadline its Lokasi's next working
 * day gave: the Admin Platform Antrean's **Tier 3** "Konfirmasi Terencana terlambat"
 * rows (spec, Work Queues). The row closes itself the moment the order is confirmed,
 * declined or cancelled, and it never cancels anything itself — a Terencairan has no
 * automatic cancel (spec, Pemesanan > Terencana: "with no automatic cancel").
 *
 * The deadline is the order's own, so the row needs no deadline of its own: it is
 * already past by the time it appears.
 */
export async function konfirmasiTerencanaTerlambat(deps: Pick<PemesananDeps, "db" | "clock">, now: Date): Promise<TerencanaAntrean[]> {
  const orders = await deps.db
    .select()
    .from(pemesananTerencana)
    .where(
      and(
        eq(pemesananTerencana.status, "diajukan"),
        isNotNull(pemesananTerencana.konfirmasiDueAt),
        lte(pemesananTerencana.konfirmasiDueAt, now),
      ),
    )
    .orderBy(pemesananTerencana.konfirmasiDueAt, pemesananTerencana.nomor);
  return Promise.all(orders.map((order) => toAntrean(deps, order)));
}

async function toAntrean(deps: Pick<PemesananDeps, "db">, order: AntreanRow): Promise<TerencanaAntrean> {
  const units = await deps.db
    .select()
    .from(pemesananTerencanaUnit)
    .where(eq(pemesananTerencanaUnit.pemesananId, order.id))
    .orderBy(pemesananTerencanaUnit.urutan);
  return {
    id: order.id,
    nomor: order.nomor,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    pemesan: { name: order.pemesanName, phoneNumber: order.phoneNumber },
    unit: units.map((unit) => ({
      jenis: unit.petakId ? ("petak" as const) : ("kavling" as const),
      nomor: unit.nomorMakam ?? unit.nomorKavling ?? "",
    })),
    calon: { name: order.calonPenghuni.name ?? order.pemegangHak.name },
    konfirmasiDueAt: order.konfirmasiDueAt,
    diajukanAt: order.diajukanAt,
  };
}

const HOUR_MS = 3_600_000;

/** The line kinds a Terencana Tagihan may carry, and nothing else. */
const KINDS_YANG_BISA_DITAGIH = ["harga_hak_pakai", "biaya_layanan_platform"] as const;

/**
 * Confirms a Diajukan Pemesanan Terencana: Dikonfirmasi, with the pay-first Tagihan
 * due when the Lokasi Mitra's hold ends.
 *
 * The Tagihan's lines are the `quote()` the family was shown, re-quoted at the instant
 * of the confirmation (so a tariff entered between submitting and confirming is the one
 * the family is charged), and one Harga Hak Pakai line per chosen unit so each line
 * names the plot it prices, followed by the Tagihan's **one** Biaya Layanan Platform.
 */
export async function konfirmasiTerencana(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<KonfirmasiTerencanaResult> {
  const parsed = konfirmasiTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const [order] = await deps.db.select().from(pemesananTerencana).where(eq(pemesananTerencana.nomor, parsed.data.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.konfirmasi", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };

  const now = deps.clock.now();
  // The hold is the Lokasi Mitra's own policy, counted from this confirmation. It is not
  // stored on the order: the Tagihan's `due_at` *is* the hold's end, so there is one fact
  // about it rather than two that can disagree — and that is where a lapsed hold is read.
  const holdHours = await deps.lokasi.terencanaHoldHours(order.lokasiId);
  if (holdHours === null) return { ok: false, reason: "lokasi_tidak_ada" };
  const holdExpiresAt = new Date(now.getTime() + holdHours * HOUR_MS);

  const units = await deps.db
    .select()
    .from(pemesananTerencanaUnit)
    .where(eq(pemesananTerencanaUnit.pemesananId, order.id))
    .orderBy(pemesananTerencanaUnit.urutan);
  if (units.length === 0) return { ok: false, reason: "harga_tidak_tersedia" };

  const harga = await deps.tariffs.quote(
    units.map((unit) => ({ kind: "harga_hak_pakai" as const, jenisMakamId: unit.jenisMakamId })),
    now,
  );
  if (!harga.ok) return { ok: false, reason: "harga_tidak_tersedia" };
  const lines = tagihanLines(harga.lines, units, order);
  if (!lines) return { ok: false, reason: "harga_tidak_tersedia" };

  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const tagihan = await deps.billing.within(tx).issueTagihan({
      moment: { kind: "terencana", holdExpiresAt },
      addressee: { name: order.pemesanName, phoneNumber: order.phoneNumber, accountId: order.pemesanAccountId },
      nomorPemesanan: order.nomor,
      placeName: order.lokasiName,
      lines,
    });
    if (!tagihan.ok) return { ok: false as const, reason: "tagihan_tidak_terbit" as const };

    // The guarded move is the lock: two confirmations at once, the second matches no row
    // and rolls its Tagihan back with it.
    const moved = await tx
      .update(pemesananTerencana)
      .set({ status: "dikonfirmasi", tagihanId: tagihan.tagihan.id, dikonfirmasiPada: now, dikonfirmasiOleh: by.accountId })
      .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "diajukan")))
      .returning({ id: pemesananTerencana.id });
    if (moved.length === 0) return { ok: false as const, reason: "pesanan_sudah_ditutup" as const };

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.konfirmasi_terencana",
      entity: { kind: "pemesanan_terencana", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan", tagihanId: null },
      after: {
        status: "dikonfirmasi",
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        total: tagihan.tagihan.total,
        holdBerakhirPada: holdExpiresAt.toISOString(),
      },
      reason: null,
    });
    return {
      ok: true as const,
      nomor: order.nomor,
      status: "dikonfirmasi" as const,
      alasan: null,
      plotsDirilis: 0,
      tagihan: {
        id: tagihan.tagihan.id,
        nomorTagihan: tagihan.tagihan.nomorTagihan,
        total: tagihan.tagihan.total,
        dueAt: tagihan.tagihan.dueAt,
        link: tagihan.tagihan.link,
      },
    };
  });
  if (!hasil.ok) return hasil;

  const unit = units.map((satu) => ({
    jenis: satu.petakId ? ("petak" as const) : ("kavling" as const),
    nomor: satu.nomorMakam ?? satu.nomorKavling ?? "",
  }));
  // The family hears about the confirmation, and about the Tagihan and the one reminder
  // the Terencana rule has, only once the confirmation is written: an announcement about
  // a rolled-back confirmation would be a lie nobody can act on.
  await deps.notifikasi.terencanaDikonfirmasi({
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    unit,
    calon: { name: order.calonPenghuni.name ?? order.pemegangHak.name },
    tagihan: hasil.tagihan,
    kontakLokasi: await deps.lokasi.kontakSiagaOf(order.lokasiId),
  });
  await deps.notifikasi.tagihanTerbit({
    tagihanId: hasil.tagihan!.id,
    nomorTagihan: hasil.tagihan!.nomorTagihan,
    nomorPemesanan: order.nomor,
    email: order.email,
    perihal: `Pemesanan Terencana di ${order.lokasiName}`,
    total: hasil.tagihan!.total,
    dueAt: hasil.tagihan!.dueAt,
    link: hasil.tagihan!.link,
  });
  return hasil;
}

/**
 * Declines a Diajukan Pemesanan Terencana: Ditolak, the reason kept, and every plot it
 * held released so another family may take them (spec, Inventory > Denah: a hold is
 * "released on decline"). The family is sent back to the wizard's Lokasi step
 * (story 49), which is what its order page links to once it reads `ditolak`.
 */
export async function tolakTerencana(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<TolakTerencanaResult> {
  const parsed = tolakTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const [order] = await deps.db.select().from(pemesananTerencana).where(eq(pemesananTerencana.nomor, parsed.data.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.konfirmasi", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };

  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pemesananTerencana)
      .set({ status: "ditolak", alasan: parsed.data.alasan })
      .where(and(eq(pemesananTerencana.id, order.id), eq(pemesananTerencana.status, "diajukan")))
      .returning({ id: pemesananTerencana.id });
    if (moved.length === 0) return { ok: false as const, reason: "pesanan_sudah_ditutup" as const };
    // Released in the same transaction as the status that ends the order: a plot freed but
    // still held is a plot another family is told it cannot have.
    const lepas = await deps.inventory.within(tx).lepasTahan(order.nomor);
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.tolak_terencana",
      entity: { kind: "pemesanan_terencana", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: "diajukan" },
      after: { status: "ditolak", alasan: parsed.data.alasan, plotsDirilis: lepas.released },
      reason: parsed.data.alasan,
    });
    return {
      ok: true as const,
      nomor: order.nomor,
      status: "ditolak" as const,
      alasan: parsed.data.alasan,
      tagihan: null,
      plotsDirilis: lepas.released,
    };
  });
  if (!hasil.ok) return hasil;

  await deps.notifikasi.terencanaDitolak({
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    alasan: parsed.data.alasan,
  });
  return hasil;
}

/**
 * The Pemesan's own withdrawal before paying (spec, story 47: "I want to withdraw free
 * at any time before paying"): Dibatalkan, the plots released, and **nothing charged**,
 * which is free by construction — a Terencairan Tagihan exists only from a confirmation,
 * and a withdrawal after one voids it here, so no money is ever owed and there is
 * nothing to return. A withdrawal *after* the money is in is a Pembatalan
 * (ticket 38) and is refused as `sudah_dibayar`, because the refund rules are that
 * ticket's and not this step's.
 */
export async function tarikTerencana(
  deps: PemesananDeps,
  pemesan: { accountId: string },
  rawInput: unknown,
): Promise<TarikTerencanaResult> {
  const parsed = tarikTerencanaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const [order] = await deps.db
    .select()
    .from(pemesananTerencana)
    .where(and(eq(pemesananTerencana.nomor, parsed.data.nomor), eq(pemesananTerencana.pemesanAccountId, pemesan.accountId)));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (order.status === "aktif") return { ok: false, reason: "sudah_dibayar" };
  if (order.status !== "diajukan" && order.status !== "dikonfirmasi") return { ok: false, reason: "pesanan_sudah_ditutup" };

  const hasil = await refusable<TarikTerencanaResult>(deps.db, async (tx) => {
    if (order.tagihanId) await deps.billing.within(tx).batalkanTagihan(tx, order.tagihanId, "dibatalkan_pemesan");
    // Guarded on the status it was read at, so a payment that lands at the same moment wins
    // and the withdrawal is told the order is paid rather than cancelling a paid order.
    const moved = await tx
      .update(pemesananTerencana)
      .set({ status: "dibatalkan", alasan: ALASAN_DITARIK_PEMESAN })
      .where(
        and(
          eq(pemesananTerencana.id, order.id),
          eq(pemesananTerencana.pemesanAccountId, pemesan.accountId),
          eq(pemesananTerencana.status, order.status),
        ),
      )
      .returning({ id: pemesananTerencana.id });
    if (moved.length === 0) return { ok: false as const, reason: "sudah_dibayar" as const };
    const lepas = await deps.inventory.within(tx).lepasTahan(order.nomor);
    return {
      ok: true as const,
      nomor: order.nomor,
      status: "dibatalkan" as const,
      alasan: ALASAN_DITARIK_PEMESAN,
      tagihan: null,
      plotsDirilis: lepas.released,
    };
  });
  if (!hasil.ok) return hasil;

  await deps.notifikasi.terencanaDibatalkan({
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    alasan: ALASAN_DITARIK_PEMESAN,
  });
  return hasil;
}

type UnitTerencanaRow = typeof pemesananTerencanaUnit.$inferSelect;

/**
 * The Tagihan lines a confirmation issues, from the quote's own wording: one line per
 * chosen unit in the order they were chosen, each naming the plot it prices, then the
 * Tagihan's one Biaya Layanan Platform. `quote()` returns one Harga Hak Pakai line per
 * line it was given, in the same order, so the units are read off in order.
 *
 * A line kind this flow may not bill is a **refusal**, never a silent omission: a missing
 * line under-charges the family, and the only thing standing between that and a real
 * invoice is the list below, which a future widening of the quote's kinds could satisfy
 * by widening this file.
 */
function tagihanLines(
  quoted: readonly QuotedLine[],
  units: readonly UnitTerencanaRow[],
  order: { lokasiId: string; lokasiName: string },
): NewTagihanLine[] | null {
  const lines: NewTagihanLine[] = [];
  let unitBerikutnya = 0;
  for (const line of quoted) {
    const kind = (KINDS_YANG_BISA_DITAGIH as readonly string[]).includes(line.kind)
      ? (line.kind as (typeof KINDS_YANG_BISA_DITAGIH)[number])
      : null;
    if (kind === null) return null;
    const nomor = line.kind === "harga_hak_pakai" ? (units[unitBerikutnya++]?.nomorMakam ?? units[unitBerikutnya - 1]?.nomorKavling ?? "") : "";
    lines.push({
      kind,
      label: nomor ? `${quoteLineLabel(line)} ${nomor}` : quoteLineLabel(line),
      amount: line.amount,
      provider:
        line.provider.kind === "lokasi_mitra"
          ? { kind: "lokasi_mitra", lokasiId: order.lokasiId, name: order.lokasiName }
          : line.provider,
    });
  }
  return lines;
}
