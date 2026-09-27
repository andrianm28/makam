/**
 * What v1 may take in one payment (spec, Billing; decided 2026-09-26): Bank
 * Indonesia caps QRIS at Rp 10.000.000 per transaction, and v1 has no Virtual
 * Account and no manual-transfer path above it, so v1 takes no order whose
 * Tagihan would exceed this amount. `issueTagihan` and `reissueTagihan` refuse a
 * total above it with `melebihi_batas_qris`, and Bayar refuses to pay a Tagihan
 * already above it.
 *
 * Kept free of Node-only imports (no `node:crypto`, no database) so a client
 * component can ask the same question the domain asks: the Terencana wizard's
 * picker refuses a selection whose total would pass it before a family is led to
 * a Tagihan that could not be paid.
 */
import { rupiahSchema, type Rupiah } from "@/lib/rupiah";

export const QRIS_PAYMENT_CAP: Rupiah = rupiahSchema.parse(10_000_000);

/** Whether `total` may be the total of a Tagihan: at most the QRIS payment cap. */
export function withinPaymentCap(total: number): boolean {
  return total <= QRIS_PAYMENT_CAP;
}
