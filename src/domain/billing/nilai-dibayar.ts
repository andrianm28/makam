/**
 * What one line of a Tagihan is really worth after a Harga Khusus (ticket 95).
 *
 * A Harga Khusus is a single negative Penyesuaian Harga Khusus line for the whole
 * Tagihan, so the families' tariff lines are not themselves reduced. Refunding a
 * whole line must therefore return only that line's proportional share of the
 * reduced total, or the request exceeds what was paid (`melebihi_tagihan`).
 *
 * The one rule, shared by every refund after a Harga Khusus (a Pembatalan
 * Terencana, a Keluhan outcome, a Layanan cancellation): a Harga Khusus is
 * applied exactly once and is borne by the Operator from the Biaya Layanan
 * Platform first (spec 503). Up to the fee it never reaches the tariff, so each
 * tariff line comes back whole; only the surplus
 *
 *     kelebihan = max(0, |penyesuaian| − F)
 *
 * reduces the tariff, and then proportionally:
 *
 *     floor(amount × (tarif − kelebihan) / tarif)
 *
 * where `tarif` is every line but the Biaya Layanan Platform and the Penyesuaian
 * itself. The fee is never apportioned this way: `biayaLayananPlatformTerbayar`
 * returns `clamp(F − |P|, 0, F)` for it, so a fault refund is the whole tariff
 * plus the payable fee and never exceeds what was paid. Whole rupiah, rounded
 * down: the Operator never refunds a fraction of a rupiah it did not receive.
 *
 * When the surplus is larger than the tariff (`|P| > T + F`, so nothing was
 * really paid), the proportional rule goes to zero or below and Refunds'
 * `ajukanBaris` (`.positive()`) would refuse the whole request. A paid line then
 * falls back to its proportional share of the Tagihan's actual total, so it
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

/** Whether a Tagihan carries a Harga Khusus: it has a Penyesuaian Harga Khusus line. */
export function adaHargaKhusus(lines: readonly Pick<TagihanLine, "kind">[]): boolean {
  return lines.some((line) => line.kind === "penyesuaian_harga_khusus");
}

/** One Tagihan line is the Biaya Layanan Platform: the one kind every fee reader keys on. */
export function adalahBiayaLayananPlatform(line: Pick<TagihanLine, "kind">): boolean {
  return line.kind === "biaya_layanan_platform";
}

/** Every Biaya Layanan Platform line of a Tagihan, in order: the one place the fee lines are filtered out. */
export function barisBiayaLayananPlatform<T extends Pick<TagihanLine, "kind">>(lines: readonly T[]): T[] {
  return lines.filter(adalahBiayaLayananPlatform);
}

/** The Biaya Layanan Platform as issued on a Tagihan, zero when there is none. */
export function biayaLayananPlatformDari(lines: readonly Pick<TagihanLine, "kind" | "amount">[]): number {
  return barisBiayaLayananPlatform(lines).reduce((sum, line) => sum + line.amount, 0);
}

/**
 * Whether Admin Platform may lower the returned Biaya Layanan Platform at
 * approval: only where the request already returns that fee **and** the Tagihan
 * carries a Harga Khusus (owner decision 2026-10-01). The approval screen and
 * the Server Action share this one predicate, so a screen that hides the field
 * and an action that must ignore it can never disagree.
 */
export function bolehTimpakanBiayaLayananPlatform(biayaLayananPlatformDikembalikan: boolean, lines: readonly Pick<TagihanLine, "kind">[]): boolean {
  return biayaLayananPlatformDikembalikan && adaHargaKhusus(lines);
}

/**
 * The Biaya Layanan Platform that may come back after a Harga Khusus: the
 * **payable fee**, the gross fee less the fee portion the Operator bore from
 * the Harga Khusus first (spec, "a Harga Khusus is borne by the Operator from
 * the Biaya Layanan Platform first, then its own funds"). The proportional
 * `nilaiDibayarBaris` rule above applies to tariff lines only, never to the
 * fee; a refund of the fee returns at most this, never more than was issued.
 */
export function biayaLayananPlatformTerbayar(lines: readonly Pick<TagihanLine, "kind" | "amount">[]): number {
  const fee = biayaLayananPlatformDari(lines);
  if (fee <= 0) return 0;
  return Math.max(0, Math.min(fee, fee + penyesuaianDari(lines)));
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
  // Spec 503: the fee bears the Harga Khusus first, so only the surplus above it ever reaches the tariff.
  const kelebihan = Math.max(0, -penyesuaian - biayaLayananPlatformDari(lines));
  if (kelebihan === 0) return line.amount;
  const nilai = Math.floor((line.amount * (tarif - kelebihan)) / tarif);
  if (nilai > 0) return Math.min(nilai, line.amount);
  // The surplus has eaten the whole tariff too, so the proportional rule goes to zero or
  // below. Fall back to the line's share of the reduced total the family actually paid.
  const sebelumPenyesuaian = lines
    .filter((satu) => satu.kind !== "penyesuaian_harga_khusus")
    .reduce((sum, satu) => sum + satu.amount, 0);
  const dibayar = lines.reduce((sum, satu) => sum + satu.amount, 0);
  if (sebelumPenyesuaian <= 0 || dibayar <= 0) return 0;
  return Math.min(line.amount, Math.max(1, Math.floor((line.amount * dibayar) / sebelumPenyesuaian)));
}
