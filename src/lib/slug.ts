/**
 * An element id from the text a heading shows: "Harga di halaman sama dengan
 * Tagihan" becomes "harga-di-halaman-sama-dengan-tagihan". One helper for every
 * content page, so a section's id is spelled the same way wherever it is written
 * and a link to it can be built from the words a reader sees.
 */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
