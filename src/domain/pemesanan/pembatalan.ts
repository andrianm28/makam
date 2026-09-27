/**
 * Cancelling a Saat Duka order (spec, story 34: "I want to cancel myself before
 * the burial (with a reason once it is confirmed), so that I can change plans.
 * Nothing has been billed before confirmation; after confirmation the Tagihan is
 * cancelled, and any payment already made is refunded except the Biaya Layanan
 * Platform"; spec, Pemesanan > Saat Duka: "Cancelling means Hak Pakai Dibatalkan,
 * Petak Tersedia, and hari-H Layanan refunded unless already Sedang Dikerjakan. No
 * cancellation fee"; ticket 24's AC 5 and 6).
 *
 * **The whole of it is one commit, and that is the point.** After the
 * confirmation an order is four things at once — a plot held by an Aktif Hak Pakai,
 * a pay-after Tagihan, a family expecting a burial, and money that may already
 * have come in. Written one after another, a failure between them leaves states
 * nobody can act on: a grave the family is told is theirs and is not, a bill for
 * a burial that will not happen, or a payment that has vanished with the order.
 * So the order row, the Hak Pakai, the Petak's release and the Tagihan are all
 * written in one transaction, and a refusal anywhere leaves the order exactly as
 * it was with its plot still held and its Tagihan still open.
 *
 * Before the confirmation there is nothing to unwind — a Diajukan order holds no
 * plot and is billed nothing — so the same call writes one row and bills nothing.
 * Both cases are the same function: the family may cancel its own order, and the
 * Admin Lokasi of that order's Lokasi Mitra may record the cancellation for them.
 *
 * What is **not** here, and why: no cancellation fee (spec: "No cancellation
 * fee", and the order never carried one), and the hari-H Layanan refund, which is
 * ticket 53's own rule.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Pemesan, PemesananDeps } from "./deps";
import { pemesananMakam } from "./schema";

/** What either cancel form sends. */
export const batalkanSaatDukaSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /**
   * The family's own words, required once the order is Dikonfirmasi (it has a
   * plot and a bill by then) and optional before it, where nothing has been
   * given up. A TPU order has no plot and no Tagihan and comes with ticket 44.
   */
  alasan: z.string().trim().max(500),
});
export type BatalkanSaatDukaInput = z.infer<typeof batalkanSaatDukaSchema>;

export type BatalkanSaatDukaResult =
  | {
      ok: true;
      pesanan: { nomor: string; status: "dibatalkan" };
      /** The Tagihan cancelled with the order, and the money asked back; null when there was no Tagihan. */
      tagihan: { nomorTagihan: string; dibatalkan: boolean; jumlahDikembalikan: number } | null;
      /** The plot that went back to the Lokasi Mitra, when the order had one. */
      petak: { nomor: string } | null;
    }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" | "pesanan_sudah_ditutup" }
  /** A confirmed order may not be cancelled without saying why. */
  | { ok: false; reason: "alasan_wajib" }
  /** A Petak Makam with a burial recorded under it: the grave is dug, and it is not a plot to sell again. */
  | { ok: false; reason: "pemakaman_sudah_dicatat" }
  /** No Hak Pakai of that id. */
  | { ok: false; reason: "hak_pakai_tidak_ditemukan" }
  /** The Hak Pakai has ended already (Kedaluwarsa, Berakhir or Dibatalkan): ending is final. */
  | { ok: false; reason: "hak_pakai_sudah_berakhir" }
  /** Its Tagihan could not be cancelled, so nothing at all was done. */
  | { ok: false; reason: "tagihan_tidak_terbit" | "tagihan_sudah_dibatalkan" };

/** The Pemesan cancels its own order, at any time before the burial. */
export async function batalkanSaatDuka(
  deps: PemesananDeps,
  pemesan: Pemesan,
  rawInput: unknown,
): Promise<BatalkanSaatDukaResult> {
  const parsed = batalkanSaatDukaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const [order] = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.nomor, parsed.data.nomor), eq(pemesananMakam.pemesanAccountId, pemesan.accountId)));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = bolehDibatalkan(order, parsed.data.alasan);
  if (refusal) return refusal;
  const hasil = await refusable(deps.db, (tx) => batalkanDenganAlasan(deps, tx, order, parsed.data.alasan, deps.clock.now()));
  if (!hasil.ok) return hasil;
  await umumkan(deps, order, hasil, parsed.data.alasan, false);
  return hasil;
}

/**
 * The Admin Lokasi of that order's own Lokasi Mitra records the cancellation on
 * the family's behalf, audited on the Lokasi. Nobody else may: not Admin Platform
 * (which chases a Lokasi by phone and never answers for it) and not another
 * Lokasi's Admin Lokasi (a family's plot is nobody else's record to close).
 */
export async function batalkanUntukPemesan(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<BatalkanSaatDukaResult> {
  const parsed = batalkanSaatDukaSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, parsed.data.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pemesanan.batalkan_untuk_pemesan", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;

  const boleh = bolehDibatalkan(order, parsed.data.alasan);
  if (boleh) return boleh;

  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const dibatalkan = await batalkanDenganAlasan(deps, tx, order, parsed.data.alasan, deps.clock.now());
    if (!dibatalkan.ok) return dibatalkan;
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.batalkan_untuk_pemesan",
      entity: { kind: "pemesanan_makam", id: order.id },
      lokasiId: order.lokasiId,
      before: { status: order.status, petakNomor: order.petakNomor, tagihanId: order.tagihanId },
      after: {
        status: "dibatalkan",
        petakNomor: dibatalkan.petak?.nomor ?? null,
        tagihan: dibatalkan.tagihan?.nomorTagihan ?? null,
        jumlahDikembalikan: dibatalkan.tagihan?.jumlahDikembalikan ?? 0,
      },
      reason: parsed.data.alasan,
    });
    return dibatalkan;
  });
  if (!hasil.ok) return hasil;
  await umumkan(deps, order, hasil, parsed.data.alasan, true);
  return hasil;
}

/**
 * What every cancellation has to satisfy before anything is written: the order is
 * still open, and a confirmed one says why. Checked before the transaction, so a
 * refusal leaves the plot held and the Tagihan open — which is the whole point of
 * checking first.
 */
function bolehDibatalkan(order: Order, alasan: string): { ok: false; reason: "pesanan_sudah_ditutup" | "alasan_wajib" } | null {
  if (order.kind !== "saat_duka") return { ok: false, reason: "pesanan_sudah_ditutup" };
  if (order.status !== "diajukan" && order.status !== "dikonfirmasi") return { ok: false, reason: "pesanan_sudah_ditutup" };
  // A confirmed order has given the Lokasi a plot to hold and the family a bill to
  // pay, so it says why it is giving both back.
  if (order.status === "dikonfirmasi" && alasan.trim() === "") return { ok: false, reason: "alasan_wajib" };
  return null;
}

/** What a cancellation undoes, as it tells the family afterwards. */
type HasilBatal = Extract<BatalkanSaatDukaResult, { ok: true }>;

/** The order row, as the cancellation needs it. */
type Order = typeof pemesananMakam.$inferSelect;

/**
 * Everything a cancellation writes, in the caller's transaction. The neighbours
 * are reached with their own `within(tx)`, so the Hak Pakai, the Petak's release
 * and the Tagihan commit or roll back with the order or not at all.
 */
async function batalkanDenganAlasan(
  deps: PemesananDeps,
  tx: Database,
  order: Order,
  alasan: string,
  now: Date,
): Promise<BatalkanSaatDukaResult> {
  const alasanTertulis = alasan.trim() === "" ? null : alasan.trim();
  let petak: { nomor: string } | null = null;
  let tagihan: HasilBatal["tagihan"] = null;

  // The right and the bill go back first, so that a refusal in either leaves the
  // order itself still Dikonfirmasi and telling the truth about both.
  if (order.hakPakaiId) {
    const hakPakai = await deps.inventory.within(tx).batalkanHakPakai({ hakPakaiId: order.hakPakaiId, alasan: alasanTertulis ?? "Pembatalan pesanan" });
    // A refusal here is the module's own reason, not a flattened one: a grave that
    // is dug, a right that is gone and a right that has already ended are three
    // different things for the Lokasi to be told, and all three leave the order whole.
    if (!hakPakai.ok) {
      return {
        ok: false,
        reason: hakPakai.reason === "tidak_ditemukan" ? "hak_pakai_tidak_ditemukan" : hakPakai.reason,
      };
    }
    petak = order.petakNomor ? { nomor: order.petakNomor } : null;
  }
  if (order.tagihanId) {
    const tagihanDibatalkan = await deps.billing.within(tx).batalkanTagihan(order.tagihanId, { alasan: "pemesanan_dibatalkan" });
    if (!tagihanDibatalkan.ok) {
      return { ok: false, reason: tagihanDibatalkan.reason === "tagihan_sudah_dibatalkan" ? "tagihan_sudah_dibatalkan" : "tagihan_tidak_terbit" };
    }
    tagihan = {
      nomorTagihan: tagihanDibatalkan.tagihan.nomorTagihan,
      dibatalkan: tagihanDibatalkan.tagihan.status === "dibatalkan",
      jumlahDikembalikan: tagihanDibatalkan.jumlahDikembalikan,
    };
  }

  const moved = await tx
    .update(pemesananMakam)
    .set({
      status: "dibatalkan",
      dibatalkanPada: now,
      alasan: alasanTertulis,
      alternatifJenisMakamId: null,
      alternatifPemakamanAt: null,
      alternatifDitawarkanPada: null,
    })
    .where(and(eq(pemesananMakam.id, order.id), eq(pemesananMakam.status, order.status)))
    .returning({ id: pemesananMakam.id });
  if (moved.length === 0) return { ok: false, reason: "pesanan_sudah_ditutup" };
  return { ok: true, pesanan: { nomor: order.nomor, status: "dibatalkan" }, tagihan, petak };
}

/** What the family is told: the plot that went back, the bill cancelled, the money on its way. */
async function umumkan(
  deps: PemesananDeps,
  order: Order,
  hasil: HasilBatal,
  alasan: string,
  olehLokasi: boolean,
): Promise<void> {
  await deps.notifikasi.pesananDibatalkan({
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    lokasi: { name: order.lokasiName },
    almarhum: { name: order.almarhumName },
    olehLokasi,
    alasan: alasan.trim() === "" ? null : alasan.trim(),
    tagihan: hasil.tagihan,
    petak: hasil.petak,
  });
}
