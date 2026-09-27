/**
 * One search param as a string: a repeated param (`?kota=a&kota=b`) or an
 * absent one is the empty string, so a page can pass a value straight to a
 * query or compare it.
 */
export function satuNilai(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}
