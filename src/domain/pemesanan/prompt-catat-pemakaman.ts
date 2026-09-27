/**
 * The "Catat Pemakaman" prompt (spec, Scheduler: "Catat Pemakaman" prompts, and
 * Work Queues: the Antrean Lokasi's Lainnya rows; ticket 25's AC 1). The day
 * after the burial the Lokasi agreed, its Admin Lokasi is asked to record what
 * actually happened — the day, the plot, the layer — because a burial nobody
 * records leaves the Hak Pakai's term unstarted and the family's Tagihan with no
 * overdue clock of its own.
 *
 * A worker tick, like the Saat Duka re-alert: the row that flips
 * `catat_pemakaman_ditagih_pada` from null is the claim, so a tick that runs
 * twice (or two workers at once) prompts once. The day is a calendar day rather
 * than a working-hours deadline: a burial is dug whatever hour the Lokasi is
 * open, and a weekend is no reason to forget it.
 */
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { addWibDays, wibDayStart } from "@/lib/time/jakarta";
import { pemesananMakam } from "./schema";
import type { PemesananDeps } from "./deps";

/** 00:00 WIB of the day after the agreed burial: when the prompt is due. */
export function jatuhCatatPemakaman(pemakamanAt: Date): Date {
  return wibDayStart(addWibDays(wibDayStart(pemakamanAt), 1));
}

/** What one run of the prompt did. */
export interface CatatPemakamanHasil {
  /** Orders whose staff were prompted to record a burial this run. */
  prompted: number;
}

/**
 * Scheduler tick: raises the "Catat Pemakaman" prompt for every confirmed order
 * whose agreed burial day has passed without a recorded Pemakaman, and for no
 * other order. Idempotent: a second run at the same `now` finds every prompt
 * already claimed, and a recorded burial removes the row for good.
 */
export async function catatPemakamanTick(deps: Pick<PemesananDeps, "db">, now: Date): Promise<CatatPemakamanHasil> {
  // The due day is a fact of the order's own agreed burial, so it is computed here
  // rather than in the query: a timestamp comparison would prompt an order buried
  // an hour before midnight, which is not the day after anything.
  const candidates = await deps.db
    .select()
    .from(pemesananMakam)
    .where(
      and(
        eq(pemesananMakam.status, "dikonfirmasi"),
        isNull(pemesananMakam.catatPemakamanDitagihPada),
        isNotNull(pemesananMakam.pemakamanAt),
      ),
    );
  let prompted = 0;
  for (const order of candidates) {
    if (jatuhCatatPemakaman(order.pemakamanAt!) > now) continue;
    const diklaim = await deps.db
      .update(pemesananMakam)
      .set({ catatPemakamanDitagihPada: now })
      .where(and(eq(pemesananMakam.id, order.id), isNull(pemesananMakam.catatPemakamanDitagihPada)))
      .returning({ id: pemesananMakam.id });
    if (diklaim.length > 0) prompted += 1;
  }
  return { prompted };
}
