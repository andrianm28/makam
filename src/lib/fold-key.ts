/**
 * Folds a name or number for a comparison or a uniqueness check: lower case,
 * single internal spaces, trimmed. Shared so that "is this the same person?"
 * is one rule wherever it is asked (the Pemegang Hak is never the Almarhum,
 * in Inventory's clearing and in a Pemesanan alike).
 */
export function foldKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}
