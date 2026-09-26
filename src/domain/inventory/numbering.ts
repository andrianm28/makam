/**
 * A Nomor Makam / Nomor Kavling pattern: text with one `{n}` / `{nn}` / `{nnn}`
 * token for the running number, zero-padded to the token's width (e.g.
 * `A-{nn}` + 7 → `A-07`). Prefixed with the Blok's name by convention, but the
 * whole pattern is editable (spec, Inventory > Denah).
 */
const TOKEN = /\{(n+)\}/;

/** Whether `pattern` has a place for the running number. */
export function isValidPattern(pattern: string): boolean {
  return TOKEN.test(pattern);
}

/** `pattern` with `n` formatted into its token, e.g. `A-{nn}`, 7 → `A-07`. */
export function numberFromPattern(pattern: string, n: number): string {
  return pattern.replace(TOKEN, (_, digits: string) => String(n).padStart(digits.length, "0"));
}

/** The default Nomor Kavling pattern for a Blok's Nomor Makam pattern: `A-{nn}` → `A-K{nn}`. */
export function kavlingPatternFrom(petakPattern: string): string {
  return petakPattern.replace(TOKEN, "K{$1}");
}

/** A sensible default Nomor Makam pattern for a new Blok: its name, a dash, then a 2-digit (or wider) running number. */
export function defaultPattern(blokName: string, cellCount: number): string {
  const digits = Math.max(2, String(cellCount).length);
  return `${blokName.trim()}-{${"n".repeat(digits)}}`;
}
