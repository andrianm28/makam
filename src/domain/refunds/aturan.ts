/**
 * The one rule ticket 31's AC 1 names (spec, Billing > Refunds):
 *
 * | Case | Biaya Layanan Platform |
 * |---|---|
 * | The Pemesan cancels | kept |
 * | The fault lies with the Lokasi, the Mitra Jasa or the Operator | refunded |
 *
 * A pure function so it is testable directly, for every `PihakBersalah` the
 * table names — not only "pemesan", the one source with a real caller today
 * (ticket 24's Saat Duka cancellation). A future caller (a Keluhan, a
 * Pembatalan, a PTSP rejection) only has to say who is at fault; it never
 * relearns this rule.
 */
import type { PihakBersalah } from "./schema";

/** Whether the Biaya Layanan Platform is refunded, from who is at fault. */
export function biayaLayananPlatformDikembalikan(pihakBersalah: PihakBersalah): boolean {
  return pihakBersalah !== "pemesan";
}

/** The lines of a Tagihan as the share rule reads them: only what each is worth and whether it is the Harga Khusus reduction. */
export type BarisTagihanUntukBagian = { kind: string; amount: number };

/**
 * What the family really paid for a line of a Tagihan, the one rule for every refund of a line (ticket 95, owner decision
 * 2026-09-30). A Harga Khusus lowers the Tagihan's total by one negative Penyesuaian line and leaves the tariff lines whole,
 * so a line is refunded in proportion: `floor(jumlah × (jumlahHarga + penyesuaian) / jumlahHarga)`, where `jumlahHarga` is
 * every line but the Penyesuaian. Rounding down means the shares never add up to more than was paid. With no Penyesuaian
 * the line is returned whole.
 */
export function bagianDibayar(lines: readonly BarisTagihanUntukBagian[], jumlah: number): number {
  const penyesuaian = lines.filter((line) => line.kind === "penyesuaian_harga_khusus").reduce((sum, line) => sum + line.amount, 0);
  if (penyesuaian === 0) return jumlah;
  const jumlahHarga = lines.filter((line) => line.kind !== "penyesuaian_harga_khusus").reduce((sum, line) => sum + line.amount, 0);
  if (jumlahHarga <= 0) return jumlah;
  return Math.max(0, Math.floor((jumlah * (jumlahHarga + penyesuaian)) / jumlahHarga));
}
