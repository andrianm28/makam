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
 * itself — any line of that tariff universe, the Biaya Layanan Platform among
 * them when it is the line being refunded. Whole rupiah, rounded down: the
 * Operator never refunds a fraction of a rupiah it did not receive, and the sum
 * of a Tagihan's refunds never exceeds what was paid.
 *
 * When the Penyesuaian is larger than the tariff, `tarif + penyesuaian` goes to
 * zero or below and the tariff-only rule breaks: the line would come out zero or
 * negative, and Refunds' `ajukanBaris` (`.positive()`) would refuse the whole
 * request. A paid line then falls back to its proportional share of the Tagihan's
 * actual total (what was really paid, the Penyesuaian already applied), so it
 * still comes back — never negative, never refused.
 */
import type { TagihanLine } from "./tagihan";

/** Whether a line is part of the tariff a Harga Khusus reduces: everything but the fee and the Penyesuaian itself. */
export function termasukTarif(line: Pick<TagihanLine, "kind">): boolean {
  return line.kind !== "biaya_layanan_platform" && line.kind !== "penyesuaian_harga_khusus";
}

/** The tariff a Harga Khusus is spread over: the sum of every line but the Biaya Layanan Platform and the Penyesuaian. */
export function tarifDari(lines: readonly Pick<TagihanLine, "kind" | "amount">[]): number {
  return lines.filter(termasukTarif).reduce((sum, line) => sum + line.amount, 0);
}

/** The whole-Tagihan Harga Khusus line's amount, zero when there is none. */
function penyesuaianDari(lines: readonly Pick<TagihanLine, "kind" | "amount">[]): number {
  return lines.filter((line) => line.kind === "penyesuaian_harga_khusus").reduce((sum, line) => sum + line.amount, 0);
}

/**
 * The value of `line` as actually paid: the line's amount less its share of the
 * Tagihan's Penyesuaian Harga Khusus. `line` is one of `lines`, so the invariant
 * cannot be broken by passing an amount that belongs to no line. A Tagihan with
 * no Harga Khusus, or no tariff to spread it across, returns the amount unchanged.
 */
export function nilaiDibayarBaris(
  lines: readonly Pick<TagihanLine, "kind" | "amount">[],
  line: Pick<TagihanLine, "kind" | "amount">,
): number {
  const tarif = tarifDari(lines);
  const penyesuaian = penyesuaianDari(lines);
  if (tarif <= 0 || penyesuaian === 0) return line.amount;
  const nilai = Math.floor((line.amount * (tarif + penyesuaian)) / tarif);
  if (nilai > 0) return Math.min(nilai, line.amount);
  // The Penyesuaian has eaten the whole tariff, so the tariff-only rule goes to zero or
  // below. Fall back to the line's share of the reduced total the family actually paid.
  const sebelumPenyesuaian = lines
    .filter((satu) => satu.kind !== "penyesuaian_harga_khusus")
    .reduce((sum, satu) => sum + satu.amount, 0);
  const dibayar = lines.reduce((sum, satu) => sum + satu.amount, 0);
  if (sebelumPenyesuaian <= 0 || dibayar <= 0) return 0;
  return Math.min(line.amount, Math.max(1, Math.floor((line.amount * dibayar) / sebelumPenyesuaian)));
}
