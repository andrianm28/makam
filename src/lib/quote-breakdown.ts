import type { AllInPrice } from "@/domain/tariffs";
import { quoteLineLabel } from "./quote-line-label";
import { formatRupiah } from "./rupiah";

/**
 * An all-in price's parts, in one line ("Harga Hak Pakai – Makam Standar Rp
 * 8.500.000 + Biaya Layanan Platform Rp 250.000"): the public Lokasi Mitra
 * page's small print under a price, so the total is never a black box.
 */
export function allInBreakdown(price: AllInPrice): string {
  return price.lines.map((line) => `${quoteLineLabel(line)} ${formatRupiah(line.amount)}`).join(" + ");
}

/**
 * The same "label amount + label amount" line as `allInBreakdown`, for parts
 * that already carry their own label (a Layanan's `HargaLayanan.parts`)
 * instead of a `QuotedLine` `quoteLineLabel` names.
 */
export function labelledPartsBreakdown(parts: readonly { label: string; amount: number }[]): string {
  return parts.map((part) => `${part.label} ${formatRupiah(part.amount)}`).join(" + ");
}
