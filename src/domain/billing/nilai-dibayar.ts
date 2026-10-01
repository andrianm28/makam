/**
 * What one line of a Tagihan is really worth after a Harga Khusus (ticket 95).
 *
 * A Harga Khusus is a single negative Penyesuaian Harga Khusus line for the whole
 * Tagihan, so the families' tariff lines are not themselves reduced. Refunding a
 * whole line must therefore return only that line's proportional share of the
 * reduced total, or the request exceeds what was paid (`melebihi_tagihan`).
 *
 * The one rule, shared by every refund after a Harga Khusus (a Pembatalan
 * Terencana, a Keluhan outcome, a Layanan cancellation), is ticket 38's:
 *
 *     floor(amount × (tarif + penyesuaian) / tarif)
 *
 * where `tarif` is every line but the Biaya Layanan Platform and the Penyesuaian
 * itself. The Biaya Layanan Platform is reduced by the same rule when it is
 * refunded. Whole rupiah, rounded down: the Operator never refunds a fraction of
 * a rupiah it did not receive, and the sum of a Tagihan's refunds never exceeds
 * what was paid.
 */
import type { TagihanLine } from "./tagihan";

/** Whether a line is part of the tariff a Harga Khusus reduces: everything but the fee and the Penyesuaian itself. */
function termasukTarif(line: Pick<TagihanLine, "kind">): boolean {
  return line.kind !== "biaya_layanan_platform" && line.kind !== "penyesuaian_harga_khusus";
}

/**
 * The value of one line as actually paid: the line's amount less its share of the
 * Tagihan's Penyesuaian Harga Khusus. A Tagihan with no Harga Khusus, or no
 * tariff to spread it across, returns the amount unchanged.
 */
export function nilaiDibayarBaris(lines: readonly Pick<TagihanLine, "kind" | "amount">[], amount: number): number {
  const tarif = lines.filter(termasukTarif).reduce((sum, line) => sum + line.amount, 0);
  const penyesuaian = lines.filter((line) => line.kind === "penyesuaian_harga_khusus").reduce((sum, line) => sum + line.amount, 0);
  if (tarif <= 0 || penyesuaian === 0) return amount;
  return Math.floor((amount * (tarif + penyesuaian)) / tarif);
}
