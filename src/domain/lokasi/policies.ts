import { z } from "zod";

const wholeNumber = (min: number, max: number) => z.number().int().min(min).max(max);

/**
 * A Lokasi Mitra's policies (spec, Lokasi > Lokasi Mitra policies). Every
 * later rule reads them from here: Masa Tenggang (Perpanjangan, expiry), K
 * (Perpanjangan terms), the Terencana hold, the Saat Duka payment window, the
 * Masa Pembatalan and the refund after it (Pembatalan), and the fee the
 * Lokasi Mitra collects offline for a Ganti Pemegang Hak.
 */
export const lokasiPoliciesSchema = z.object({
  masaTenggangMonths: wholeNumber(0, 60),
  /** K: the most terms one Perpanjangan Makam may buy. */
  maxPerpanjanganTerms: wholeNumber(1, 10),
  terencanaHoldHours: wholeNumber(1, 24 * 14),
  saatDukaPaymentWindowHours: wholeNumber(1, 24 * 30),
  masaPembatalanDays: wholeNumber(0, 365),
  refundAfterMasaPembatalanPercent: wholeNumber(0, 100),
  /** Rupiah, collected offline by the Lokasi Mitra (never on a Tagihan). */
  gantiPemegangHakFee: wholeNumber(0, 1_000_000_000),
});
export type LokasiPolicies = z.infer<typeof lokasiPoliciesSchema>;

/**
 * A Lokasi Mitra's flags. Transfers by inheritance are always allowed, so only
 * sale transfers have a flag.
 */
export const lokasiFlagsSchema = z.object({
  /** Until it is on, the Lokasi page hides the Terencana entry (switched on after the Petak are cleared and a Cek Denah). */
  pemesananTerencanaAktif: z.boolean(),
  /** Boleh tumpang: the minimum years since the last Pemakaman and the most layers in one Petak Makam. */
  tumpang: z.object({ allowed: z.boolean(), minYears: wholeNumber(0, 100), maxLayers: wholeNumber(2, 10) }),
  /** A released but not yet cleared (still Terisi) plot may be sold as tumpang. */
  tumpangOnReleasedPlots: z.boolean(),
  /** Ganti Pemegang Hak by sale. */
  saleTransfersAllowed: z.boolean(),
  /**
   * Harga Tampil: the Lokasi Mitra lets its prices be shown on the site, so families order on the platform. Off, its
   * page shows no amount and sends families to the CS on WhatsApp, and Admin Platform enters their orders (owner,
   * 2026-11-02). A Lokasi Mitra saved before the flag existed has none, which reads as on.
   */
  hargaTampil: z.boolean().default(true),
  /**
   * Its Saat Duka burial is already a complete package, so the wizard offers no Layanan Tambahan there (dri, 2026-11-02).
   * Absent on a Lokasi saved before the flag existed, which reads as off.
   */
  paketLengkap: z.boolean().optional(),
});
export type LokasiFlags = z.infer<typeof lokasiFlagsSchema>;
/** The flags as a caller sends them: Harga Tampil may be left out, and then it is on. */
export type LokasiFlagsInput = z.input<typeof lokasiFlagsSchema>;

/** The policies a new Lokasi Mitra starts with (spec defaults). */
export const DEFAULT_POLICIES: LokasiPolicies = {
  masaTenggangMonths: 3,
  maxPerpanjanganTerms: 1,
  terencanaHoldHours: 24,
  saatDukaPaymentWindowHours: 72,
  masaPembatalanDays: 7,
  refundAfterMasaPembatalanPercent: 0,
  gantiPemegangHakFee: 0,
};

/**
 * The flags a new Lokasi Mitra starts with: Pemesanan Terencana off and sale
 * transfers forbidden (spec); tumpang off until Admin Platform records the
 * Lokasi's rule, with the DKI practice (3 years, 2 layers) prefilled.
 */
export const DEFAULT_FLAGS: LokasiFlags = {
  pemesananTerencanaAktif: false,
  tumpang: { allowed: false, minYears: 3, maxLayers: 2 },
  tumpangOnReleasedPlots: false,
  saleTransfersAllowed: false,
  hargaTampil: true,
  paketLengkap: false,
};
