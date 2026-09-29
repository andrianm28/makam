/**
 * Why a Pemesanan Terencana became Dibatalkan before it was paid (spec, Pemesanan >
 * Terencana: `Dibatalkan (reason "batas pembayaran lewat", withdrawal, or Pembatalan)`;
 * ticket 37). The two reasons this ticket writes are keys, never free text; the third,
 * a Pembatalan after payment, is ticket 38's own.
 *
 * Nothing here reaches the database, so a `"use client"` screen may take it.
 */
export const ALASAN_BATAL_TERENCANA = {
  /** The payment hold ran out with the Tagihan unpaid, so the plots were released. */
  batas_pembayaran_lewat: "Batas pembayaran lewat",
  /** The Pemesan withdrew before paying, and nothing was charged. */
  ditarik_pemesan: "Ditarik oleh Pemesan sebelum membayar",
  /** A paid order cancelled at the Pemegang Hak's request, once the Admin Lokasi confirmed there was no Pemakaman (ticket 38). */
  pembatalan: "Pembatalan disetujui Lokasi Mitra",
} as const;
export type AlasanBatalTerencana = keyof typeof ALASAN_BATAL_TERENCANA;

/** The wording of a stored cancellation reason, or null when it is not one this ticket writes. */
export function alasanBatalTerencana(value: string | null | undefined): string | null {
  return value && Object.hasOwn(ALASAN_BATAL_TERENCANA, value) ? ALASAN_BATAL_TERENCANA[value as AlasanBatalTerencana] : null;
}
