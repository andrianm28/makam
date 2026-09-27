/**
 * What a Pemesanan Terencana costs (spec, Pemesanan > Terencana; Billing, the
 * Rp 10.000.000 QRIS cap decided 2026-09-26): the headline is one Harga Hak Pakai
 * per chosen unit plus **one** Biaya Layanan Platform for the whole Tagihan, never
 * one per unit, and v1 takes no selection whose total would pass the cap. The
 * "Nanti" line — the Biaya Pemakaman of each later burial, at that burial's own
 * tariff — is not part of this total; it is quoted per burial when it happens.
 *
 * Pure and free of Node-only imports, so the wizard's picker asks the same
 * question the order does as a family taps one plot after another.
 */
import { withinPaymentCap } from "@/domain/billing/batas";
import { rupiahSchema, sumRupiah, type Rupiah } from "@/lib/rupiah";

/** Rp 0: what a unit whose Jenis Makam is not priced contributes (the wizard never lets such a unit be picked). */
const nihil = rupiahSchema.parse(0);

/** One unit's own price, as `quote()` priced it: what one chosen plot carries, its Biaya Layanan Platform apart. */
export interface HargaUnit {
  jenisMakamId: string;
  /** The Harga Hak Pakai of one unit of this Jenis Makam, from `quote()`. */
  hargaHakPakai: Rupiah;
  /** The one Biaya Layanan Platform a Lokasi Mitra order carries, from `quote()`. */
  biayaLayananPlatform: Rupiah;
}

export interface RincianTerencana {
  /** One entry per chosen unit, in the order the Pemesan picked them. */
  hargaHakPakai: Rupiah[];
  /** The one Biaya Layanan Platform for the whole Tagihan. */
  biayaLayananPlatform: Rupiah;
  /** The exact sum; a sum past what rupiah can hold is refused rather than rounded. */
  total: Rupiah | null;
  /** Whether this selection may be taken in v1 (its total is within the QRIS cap). */
  dalamBatas: boolean;
}

/** The price of a selection of units, given what each one's Jenis Makam costs. */
export function totalTerencana(harga: readonly HargaUnit[], jenisMakamIds: readonly string[]): RincianTerencana {
  const hargaHakPakai = jenisMakamIds.map((jenisMakamId) => {
    const satu = harga.find((satu) => satu.jenisMakamId === jenisMakamId);
    return satu ? satu.hargaHakPakai : nihil;
  });
  // One Biaya Layanan Platform per Tagihan, so it is taken from the first unit and
  // added once, however many plots the Pemesan picked.
  const biayaLayananPlatform = harga.find((satu) => satu.jenisMakamId === jenisMakamIds[0])?.biayaLayananPlatform ?? nihil;
  const sum = sumRupiah([...hargaHakPakai, biayaLayananPlatform]);
  const total = sum.ok ? sum.amount : null;
  return { hargaHakPakai, biayaLayananPlatform, total, dalamBatas: total !== null && withinPaymentCap(total) };
}
