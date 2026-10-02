/**
 * The kinds of further burial, kept apart from `schema.ts` (a Drizzle table file) so a client import graph
 * (the "Makamkan di sini" draft) may take them without pulling the database in.
 */
/**
 * The three requests "Makamkan di sini" can carry (spec, Pemesanan > Burial
 * under an existing Hak Pakai): a tumpang on an occupied plot, the next plot of
 * a Kavling Keluarga, or the burial of the Calon Penghuni a Terencana plot was
 * prepared for. All three run the same track; the difference is which checks
 * apply (a tumpang waits out the policy, an unused plot does not).
 */
export const tumpangJenisKeys = ["tumpang", "kavling_berikutnya", "calon_penghuni"] as const;
export type TumpangJenis = (typeof tumpangJenisKeys)[number];
