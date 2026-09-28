import type { SyaratView } from "./tampilan";

/**
 * The Syarat Pemesanan Terencana, in the words shown before Kirim and kept on
 * the order.
 *
 * Pure and domain-import-free: `SyaratView` crosses from `tampilan.ts` only
 * as `import type` (erased at compile time), never as a value. `tampilan.ts`
 * itself imports `lokasiFacilities`, a value, from the `@/domain/lokasi`
 * barrel (for `lokasiView`, called only from the server page) — a value a
 * `"use client"` file may never take from a domain module's barrel (AGENTS.md).
 * `data-kirim.tsx` calls this function directly from here, not from
 * `tampilan.ts`, precisely so its import graph never has to include that
 * value: every file that reaches `tampilan.ts` from the client side
 * (`denah-picker.tsx`, `data-kirim.tsx`, `ringkasan.ts`, this file) takes only
 * its types.
 */
export function syaratLines(syarat: SyaratView): string[] {
  return [
    `Masa Pembatalan ${syarat.masaPembatalanDays} hari sejak pembayaran: membatalkan Pemesanan Terencana dalam masa ini mengembalikan seluruh tarif.`,
    `Setelah masa itu, pengembalian ${syarat.refundPercent}% dari tarif, sesuai kebijakan ${syarat.lokasiNama}.`,
    `Hak Pakai diberikan oleh ${syarat.lokasiNama}; Makam.co.id mencatat dan menerima pembayarannya.`,
  ];
}
