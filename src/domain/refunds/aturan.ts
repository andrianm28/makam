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
