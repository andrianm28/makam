/**
 * How a Tagihan is paid, by its total (ADR 0013, 2 Nov 2026; replaces v1's
 * "no order above Rp 10.000.000" rule of 2026-09-26). Every transaction stays
 * on the platform; only the way the money arrives depends on the amount:
 *
 * - up to the QRIS cap (Bank Indonesia: Rp 10.000.000 per transaction): Bayar,
 *   by QRIS;
 * - above it, up to the PaymentProvider's Virtual Account limit: Bayar, by
 *   Virtual Account (`PaymentProvider.batasVirtualAccount`, 0 while VA is off);
 * - above that: a transfer to the Operator's account (Pengaturan Operator),
 *   recorded by Admin Platform with its proof (`catatPembayaranManual`).
 *
 * So a Tagihan may be issued for any total up to `BATAS_TAGIHAN`.
 *
 * Kept free of Node-only imports (no `node:crypto`, no database) so a client
 * component can ask the same question the domain asks.
 */
import { RUPIAH_MAX, rupiahSchema, type Rupiah } from "@/lib/rupiah";

/** Bank Indonesia's cap on one QRIS transaction. */
export const QRIS_PAYMENT_CAP: Rupiah = rupiahSchema.parse(10_000_000);

/** The largest total a Tagihan may have: whatever the platform can hold exactly. */
export const BATAS_TAGIHAN: Rupiah = rupiahSchema.parse(RUPIAH_MAX);

/** Whether `total` may be the total of a Tagihan (at most `BATAS_TAGIHAN`). */
export function withinPaymentCap(total: number): boolean {
  return total <= BATAS_TAGIHAN;
}

export const caraBayarKinds = ["qris", "virtual_account", "transfer_manual"] as const;
/** How a Tagihan of a given total is paid (see this file's header). */
export type CaraBayar = (typeof caraBayarKinds)[number];

/**
 * How a Tagihan totalling `total` is paid, given the PaymentProvider's
 * Virtual Account limit (`batasVirtualAccount`; at most the QRIS cap means
 * Virtual Account is off and everything above the cap is a manual transfer).
 */
export function caraBayar(total: number, batasVirtualAccount: number): CaraBayar {
  if (total <= QRIS_PAYMENT_CAP) return "qris";
  if (total <= batasVirtualAccount) return "virtual_account";
  return "transfer_manual";
}
