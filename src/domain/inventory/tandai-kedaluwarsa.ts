/**
 * The end of a fixed-term Hak Pakai (spec, Inventory > Hak Pakai; story 57):
 * once its end date has passed, an Aktif Hak Pakai becomes Kedaluwarsa. The
 * tick is driven from database state, so running it twice is harmless.
 *
 * A payment that extends the Hak Pakai moves its end date into the future, so
 * an extended right is never touched; the clock is WIB (Asia/Jakarta).
 */
import { and, eq, isNotNull, lt } from "drizzle-orm";
import { wibDayStart } from "@/lib/time/jakarta";
import type { InventoryDeps } from "./deps";
import { inventoryHakPakai } from "./schema";

/**
 * Every Aktif Hak Pakai whose end date (stored at UTC midnight of the WIB end
 * date) is already behind today's WIB midnight becomes Kedaluwarsa; returns how
 * many changed. The end date itself is still Aktif.
 */
export async function tandaiKedaluwarsa(deps: Pick<InventoryDeps, "db" | "clock">, now: Date): Promise<number> {
  const changed = await deps.db
    .update(inventoryHakPakai)
    .set({ status: "kedaluwarsa" })
    .where(and(eq(inventoryHakPakai.status, "aktif"), isNotNull(inventoryHakPakai.endDate), lt(inventoryHakPakai.endDate, wibDayStart(now))))
    .returning({ id: inventoryHakPakai.id });
  return changed.length;
}
