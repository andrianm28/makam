/**
 * How a file's size limit reads in Bahasa Indonesia, from the very bytes the
 * check refuses (`KTP_CHECK_MAX_BYTES`, `AGREEMENT_SCAN_MAX_BYTES`): a refusal
 * says the limit without a second number being written somewhere else. Every
 * limit worded here is a whole number of MB.
 */
export function palingBesar(maxBytes: number): string {
  return `paling besar ${maxBytes / (1024 * 1024)} MB`;
}
