/**
 * What a Pembatalan of a paid Pemesanan Terencana refunds (spec, Pemesanan > Requests from the Pemegang
 * Hak: "the refund is computed from the snapshot policy (100% within the Masa Pembatalan, else the set %;
 * Biaya Layanan Platform never refunded)"; ticket 38). Pure: it reads nothing, so the number the family
 * is shown before it asks and the number the Admin Lokasi approves are one calculation.
 *
 * - The **Syarat snapshot on the order** is the only policy read: what the family agreed to when it
 *   ordered, never the Lokasi Mitra's policy today.
 * - **Inside the Masa Pembatalan** (strictly before its end, which is the payment plus N x 24 h) the whole
 *   tariff comes back; after it, the share the Syarat named. The instant that counts is the one the
 *   request is *made*, so a Lokasi that is slow to answer never costs the family its full refund.
 * - **The Biaya Layanan Platform is never refunded** on a Pemesan's own cancellation (the fee rule of
 *   Refunds, `biayaLayananPlatformDikembalikan("pemesan")`), so it is not part of the tariff here.
 * - Whole rupiah, rounded **down**: the Operator never refunds a fraction of a rupiah it did not receive.
 */
import { biayaLayananPlatformDari, tarifDari, type TagihanLine } from "@/domain/billing";
import type { BarisRefundPembatalan, SyaratTerencana } from "./schema";

export interface HitungPembatalanInput {
  /** The lines of the Tagihan the order was paid with. */
  /** The lines this Hak Pakai is refunded from: its own Harga Hak Pakai line, and the Tagihan's Biaya Layanan Platform to show as kept. */
  lines: readonly Pick<TagihanLine, "kind" | "amount">[];
  /** The Syarat snapshotted on the order. */
  syarat: Pick<SyaratTerencana, "refundAfterMasaPembatalanPercent">;
  /** The end of the Masa Pembatalan, counted from the payment. */
  masaPembatalanBerakhirPada: Date;
  /** The moment the request is made. */
  sekarang: Date;
  /** The number the Hak Pakai's plot is known by, named on the refund. */
  nomorUnit: string;
  /** The Lokasi Mitra whose tariff it is, and whose unpaid Pencairan the refund nets from. */
  lokasiId: string;
}

export interface HitungPembatalan {
  /** Whether the request is made strictly before the Masa Pembatalan ends. */
  dalamMasaPembatalan: boolean;
  persenRefund: number;
  /** The tariff the percentage is taken from: every line but the Biaya Layanan Platform. */
  tarif: number;
  /** The fee, shown to the family as kept. */
  biayaLayananPlatform: number;
  jumlahRefund: number;
  /** What Refunds' `ajukanBaris` takes: empty when nothing comes back. */
  lines: BarisRefundPembatalan[];
}

export function hitungPembatalanTerencana(input: HitungPembatalanInput): HitungPembatalan {
  const dalamMasaPembatalan = input.sekarang.getTime() < input.masaPembatalanBerakhirPada.getTime();
  const persenRefund = dalamMasaPembatalan ? 100 : input.syarat.refundAfterMasaPembatalanPercent;
  const tarif = tarifDari(input.lines);
  const biayaLayananPlatform = biayaLayananPlatformDari(input.lines);
  const jumlahRefund = Math.max(0, Math.floor((tarif * persenRefund) / 100));
  const lines: BarisRefundPembatalan[] =
    jumlahRefund > 0
      ? [{ label: `Pengembalian Hak Pakai ${input.nomorUnit} (${persenRefund}% dari tarif)`, amount: jumlahRefund, lokasiId: input.lokasiId }]
      : [];
  return { dalamMasaPembatalan, persenRefund, tarif, biayaLayananPlatform, jumlahRefund, lines };
}
