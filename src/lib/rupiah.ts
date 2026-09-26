import { z } from "zod";

/**
 * The largest amount of money anywhere in makam.co.id: Rp 100.000.000.000,
 * far above any grave, fee or Tagihan, and far below Number.MAX_SAFE_INTEGER,
 * so every amount is exact as a JavaScript number.
 */
export const RUPIAH_MAX = 100_000_000_000;

/** An amount of money: whole rupiah from Rp 0 to RUPIAH_MAX, never a float. The one schema every boundary uses. */
export const rupiahSchema = z.number().int().min(0).max(RUPIAH_MAX).brand<"Rupiah">();

/** Whole rupiah, checked by `rupiahSchema` (or produced by the arithmetic below). */
export type Rupiah = z.infer<typeof rupiahSchema>;

/** The result of adding or multiplying amounts: exact, or refused when it would pass RUPIAH_MAX. */
export type RupiahResult = { ok: true; amount: Rupiah } | { ok: false; reason: "jumlah_terlalu_besar" };

const tooLarge = { ok: false, reason: "jumlah_terlalu_besar" } as const;

function checked(value: number): RupiahResult {
  if (!Number.isSafeInteger(value) || value < 0 || value > RUPIAH_MAX) return tooLarge;
  return { ok: true, amount: value as Rupiah };
}

/** The exact sum of amounts, or refused (never rounded) when it passes RUPIAH_MAX. */
export function sumRupiah(amounts: readonly Rupiah[]): RupiahResult {
  let total = 0;
  for (const amount of amounts) {
    total += amount;
    // Each step stays below 2 × RUPIAH_MAX, so checking as we go keeps every partial sum exact.
    if (total > RUPIAH_MAX) return tooLarge;
  }
  return checked(total);
}

/** An amount times a whole number (e.g. a Perpanjangan price × terms), or refused when it passes RUPIAH_MAX. */
export function timesRupiah(amount: Rupiah, times: number): RupiahResult {
  if (!Number.isSafeInteger(times) || times < 0) return tooLarge;
  return checked(amount * times);
}

/**
 * "Rp 7.500.000": whole rupiah with dots grouping thousands (no sen, ever).
 * A negative amount (a Penyesuaian Harga Khusus line) reads "−Rp 2.000.000".
 */
export function formatRupiah(amount: number): string {
  const grouped = String(Math.abs(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount < 0 ? "−" : ""}Rp ${grouped}`;
}

/**
 * An amount read from a Postgres `bigint` column (the driver hands it over as
 * text). Converted exactly; a value outside Rp 0..RUPIAH_MAX (so also any
 * beyond Number.MAX_SAFE_INTEGER) is refused with an error rather than rounded.
 */
export function rupiahFromDatabase(value: string | number | bigint): Rupiah {
  const exact = BigInt(value);
  if (exact < BigInt(0) || exact > BigInt(RUPIAH_MAX)) {
    throw new Error(`Stored rupiah amount ${exact} is outside Rp 0..${RUPIAH_MAX}`);
  }
  return Number(exact) as Rupiah;
}
