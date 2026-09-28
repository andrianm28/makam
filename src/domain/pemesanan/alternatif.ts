/**
 * Tawarkan alternatif: the Lokasi Mitra's other answer to a Saat Duka order
 * (spec, Pemesanan > Saat Duka: "Tawarkan alternatif (another Jenis Makam / day,
 * accept or decline by the Pemesan; declining becomes a Tolak)"; stories 31, 32;
 * ticket 24's AC 2).
 *
 * The offer is a pending one on the order itself — a new Jenis Makam, a new
 * burial day, or both — and the order stays `diajukan` while it waits: it still
 * has no plot and nothing is billed, so the Lokasi's own Antrean Lokasi row and
 * the Tier 1 late row keep pointing at it, which is right: the order is still
 * waiting for a confirmation, and now the Lokasi has said what it can offer.
 *
 * Two things are the whole difficulty of the feature, and both are why the offer
 * stores no price and no deadline of its own:
 *
 * 1. **The total is `quote()`'s, at the moment it is shown and again at the
 *    moment it is accepted.** Nothing is frozen on the order, so a family can
 *    never accept a number that has quietly stopped being the price; a price
 *    that has become unpriceable (or has passed the QRIS cap) refuses the
 *    acceptance with a reason rather than confirming at a total nobody agreed to.
 * 2. **Accepting recomputes `konfirmasiDueAt` from the acceptance.** Carrying the
 *    first deadline over would promise a confirmation by a moment already past,
 *    for a Jenis Makam whose plot nobody has assigned yet.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { withinPaymentCap } from "@/domain/billing";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { quoteLineLabel } from "@/lib/quote-line-label";
import { wib } from "@/lib/time/jakarta";
import type { AlasanTolakKeluarga } from "./alasan-tolak";
import { JAM_KONFIRMASI_SAAT_DUKA, saatDukaHarga } from "./pilihan";
import type { Pemesan, PemesananDeps } from "./deps";
import { pemesananMakam } from "./schema";
import { tolakDenganAlasan } from "./tolak";

/** What the Admin Lokasi's alternative form sends: another Jenis Makam, another day, or both. */
export const tawarkanAlternatifSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** Another Jenis Makam at that same Lokasi Mitra; empty while only the day changes. */
  jenisMakamId: z.string().trim(),
  /** The burial the Lokasi offers, as `datetime-local` holds it: "YYYY-MM-DDTHH:mm" in WIB. Empty while only the Jenis Makam changes. */
  pemakamanAt: z.string().trim().max(40),
});
export type TawarkanAlternatifInput = z.infer<typeof tawarkanAlternatifSchema>;

/** What the Pemesan's one tap sends: nothing but the order it answers. */
export const jawabAlternatifSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
});
export type JawabAlternatifInput = z.infer<typeof jawabAlternatifSchema>;

export type TawarkanAlternatifResult =
  | {
      ok: true;
      pesanan: { nomor: string; status: "diajukan" };
      /** The all-in total `quote()` prices the offer at right now: what the family decides on. */
      alternatif: { total: number; lines: { label: string; amount: number }[] };
    }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" | "pesanan_sudah_ditutup" }
  /** Neither another Jenis Makam nor another day: there is nothing on offer. */
  | { ok: false; reason: "alternatif_kosong" }
  /** No Jenis Makam of that id at that Lokasi Mitra, so it cannot be offered. */
  | { ok: false; reason: "jenis_makam_tidak_ditemukan" }
  /** The offered Jenis Makam cannot be priced now, or its all-in total is past the QRIS cap. */
  | { ok: false; reason: "harga_tidak_tersedia" };

export type JawabAlternatifResult =
  | { ok: true; pesanan: { nomor: string; status: "diajukan" | "ditolak"; alasan: AlasanTolakKeluarga | null } }
  | { ok: false; reason: "input_tidak_valid" | "pesanan_tidak_ditemukan" }
  /** The order has moved on (confirmed, declined, cancelled): there is nothing to answer. */
  | { ok: false; reason: "pesanan_sudah_ditutup" }
  /** No offer is on the table: nothing to accept and nothing to refuse. */
  | { ok: false; reason: "tidak_ada_alternatif" }
  /** The offer can no longer be priced (or has passed the QRIS cap): nobody may accept a number nobody quoted. */
  | { ok: false; reason: "harga_tidak_tersedia" };

/**
 * The order as this file needs it, with the one check every entry shares: it is
 * a Saat Duka order still `diajukan` and it has a Jenis Makam to change (a
 * Terencana order is a table of its own; a TPU order has no plot and comes with
 * ticket 44). A read, never a write.
 */
async function orderDiajukan(
  deps: PemesananDeps,
  nomor: string,
): Promise<
  | { ok: true; order: typeof pemesananMakam.$inferSelect }
  | { ok: false; reason: "pesanan_tidak_ditemukan" | "pesanan_sudah_ditutup" }
> {
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (order.kind !== "saat_duka" || !order.jenisMakamId) return { ok: false, reason: "pesanan_sudah_ditutup" };
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };
  return { ok: true, order };
}

/**
 * Offers an alternative on one Diajukan order: another Jenis Makam of that same
 * Lokasi Mitra, another burial day, or both. The offer replaces whatever was on
 * the table before, so a Lokasi that changes its mind once does not leave a
 * family choosing between two dead offers.
 */
export async function tawarkanAlternatif(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<TawarkanAlternatifResult> {
  const parsed = tawarkanAlternatifSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;

  const ditemukan = await orderDiajukan(deps, input.nomor);
  if (!ditemukan.ok) return ditemukan;
  const { order } = ditemukan;
  const refusal = writeRefusal(by, "pemesanan.tawarkan_alternatif", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;

  const now = deps.clock.now();
  const jenisMakamId = input.jenisMakamId.trim();
  const pemakamanAt = input.pemakamanAt.trim() === "" ? null : wib(input.pemakamanAt);
  // An offer that changes nothing is not an offer: a family asked to "choose" the
  // day it already chose is being sent round in circles.
  const jenisBerbeda = jenisMakamId !== "" && jenisMakamId !== order.jenisMakamId;
  const hariBerbeda =
    pemakamanAt !== null && pemakamanAt.getTime() !== (order.rencanaPemakamanAt?.getTime() ?? Number.NaN);
  if (!jenisBerbeda && !hariBerbeda) return { ok: false, reason: "alternatif_kosong" };

  let jenisNama: string | null = null;
  if (jenisBerbeda) {
    const pricing = await deps.tariffs.lokasiPricing(order.lokasiId, now);
    const kartu = pricing.jenisMakam.find((one) => one.jenisMakam.id === jenisMakamId);
    // A Jenis Makam of another Lokasi Mitra (or of none) is not on this order's table.
    if (!kartu) return { ok: false, reason: "jenis_makam_tidak_ditemukan" };
    jenisNama = kartu.jenisMakam.name;
  }

  // What the family is shown, priced the way its Tagihan would be. Not stored: it
  // is quoted again when the family answers.
  const harga = await saatDukaHarga(deps, order.lokasiId, jenisBerbeda ? jenisMakamId : order.jenisMakamId!, now);
  if (!harga) return { ok: false, reason: "harga_tidak_tersedia" };
  const lines = harga.lines.map((line) => ({ label: quoteLineLabel(line), amount: line.amount }));

  const ditawarkan = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const moved = await tx
      .update(pemesananMakam)
      .set({
        alternatifJenisMakamId: jenisBerbeda ? jenisMakamId : null,
        alternatifPemakamanAt: hariBerbeda ? pemakamanAt : null,
        alternatifDitawarkanPada: now,
      })
      .where(and(eq(pemesananMakam.id, order.id), eq(pemesananMakam.status, "diajukan")))
      .returning({ id: pemesananMakam.id });
    if (moved.length === 0) return { ok: false as const, reason: "pesanan_sudah_ditutup" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pemesanan.tawarkan_alternatif",
      entity: { kind: "pemesanan_makam", id: order.id },
      lokasiId: order.lokasiId,
      before: { jenisMakamId: order.jenisMakamId, rencanaPemakamanAt: order.rencanaPemakamanAt?.toISOString() ?? null },
      after: {
        jenisMakamId: jenisBerbeda ? jenisMakamId : order.jenisMakamId,
        jenisMakamName: jenisNama ?? order.jenisMakamName,
        rencanaPemakamanAt: (hariBerbeda ? pemakamanAt : order.rencanaPemakamanAt)?.toISOString() ?? null,
        total: harga.total,
      },
      reason: null,
    });
    return { ok: true as const };
  });
  if (!ditawarkan.ok) return ditawarkan;

  await deps.notifikasi.pesananAlternatifDitawarkan({
    pemesananId: order.id,
    nomor: order.nomor,
    email: order.email,
    pemesanName: order.pemesanName,
    lokasi: { id: order.lokasiId, name: order.lokasiName },
    almarhum: { name: order.almarhumName, tanggalWafat: order.tanggalWafat },
    dari: { jenisMakam: order.jenisMakamName, pemakamanAt: order.rencanaPemakamanAt },
    ke: { jenisMakam: jenisNama, pemakamanAt: hariBerbeda ? pemakamanAt : order.rencanaPemakamanAt },
    total: harga.total,
    lines,
  });
  return { ok: true, pesanan: { nomor: order.nomor, status: "diajukan" }, alternatif: { total: harga.total, lines } };
}

/**
 * The Pemesan accepts the alternative: the order moves on with the new Jenis Makam
 * and day, the offer is off the table, and the confirmation deadline is counted
 * again from this moment.
 */
export async function terimaAlternatif(
  deps: PemesananDeps,
  pemesan: Pemesan,
  rawInput: unknown,
): Promise<JawabAlternatifResult> {
  return jawab(deps, pemesan, rawInput, "terima");
}

/**
 * The Pemesan refuses the alternative, which is a Tolak with the reason
 * "alternatif_ditolak" off the same closed list: the same status, the same email
 * with the rebook link, the same Tier 1 call and the same count on the Lokasi
 * (spec: "declining becomes a Tolak").
 */
export async function tolakAlternatif(
  deps: PemesananDeps,
  pemesan: Pemesan,
  rawInput: unknown,
): Promise<JawabAlternatifResult> {
  return jawab(deps, pemesan, rawInput, "tolak");
}

/** One answer to the offer on the table, from the Pemesan who placed the order. */
async function jawab(
  deps: PemesananDeps,
  pemesan: Pemesan,
  rawInput: unknown,
  jawaban: "terima" | "tolak",
): Promise<JawabAlternatifResult> {
  const parsed = jawabAlternatifSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  // Only the family's own order is ever answered; another Akun's order is not found.
  const [order] = await deps.db
    .select()
    .from(pemesananMakam)
    .where(and(eq(pemesananMakam.nomor, parsed.data.nomor), eq(pemesananMakam.pemesanAccountId, pemesan.accountId)));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  if (order.status !== "diajukan") return { ok: false, reason: "pesanan_sudah_ditutup" };
  if (!order.alternatifDitawarkanPada) return { ok: false, reason: "tidak_ada_alternatif" };

  if (jawaban === "tolak") {
    const ditolak = await tolakDenganAlasan(deps, order.id, "alternatif_ditolak");
    if (!ditolak.ok) return ditolak;
    return { ok: true, pesanan: { nomor: order.nomor, status: "ditolak", alasan: "alternatif_ditolak" } };
  }

  const now = deps.clock.now();
  const jenisId = order.alternatifJenisMakamId ?? order.jenisMakamId;
  if (!jenisId) return { ok: false, reason: "pesanan_sudah_ditutup" };
  // The price is quoted again here, at the moment the family accepts: a total that
  // is not `quote()`'s any more is not a total the family agreed to.
  const harga = await saatDukaHarga(deps, order.lokasiId, jenisId, now);
  if (!harga || !withinPaymentCap(harga.total)) return { ok: false, reason: "harga_tidak_tersedia" };
  // And the confirmation deadline starts again: this is a new thing to confirm, and
  // the old deadline is behind the family by the time it answers.
  const batas = await deps.lokasi.serviceHoursDeadline(order.lokasiId, JAM_KONFIRMASI_SAAT_DUKA, now);
  const jenisNama = order.alternatifJenisMakamId
    ? ((await deps.tariffs.lokasiPricing(order.lokasiId, now)).jenisMakam.find((one) => one.jenisMakam.id === jenisId)
        ?.jenisMakam.name ?? order.jenisMakamName)
    : order.jenisMakamName;

  // The offer's own instant is in the WHERE, so a family that answers a stale
  // screen (after the Lokasi has offered something else meanwhile) changes nothing.
  const diterima = await deps.db
    .update(pemesananMakam)
    .set({
      jenisMakamId: jenisId,
      jenisMakamName: jenisNama,
      rencanaPemakamanAt: order.alternatifPemakamanAt ?? order.rencanaPemakamanAt,
      konfirmasiDueAt: batas.ok ? batas.at : null,
      alternatifJenisMakamId: null,
      alternatifPemakamanAt: null,
      alternatifDitawarkanPada: null,
    })
    .where(
      and(
        eq(pemesananMakam.id, order.id),
        eq(pemesananMakam.status, "diajukan"),
        eq(pemesananMakam.alternatifDitawarkanPada, order.alternatifDitawarkanPada),
      ),
    )
    .returning({ id: pemesananMakam.id });
  if (diterima.length === 0) return { ok: false, reason: "tidak_ada_alternatif" };
  return { ok: true, pesanan: { nomor: order.nomor, status: "diajukan", alasan: null } };
}
