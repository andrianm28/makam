import { inArray, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { pemesananMakam, pemesananTerencanaUnit } from "./schema";

/**
 * Whether any Pemesanan, in any status (held, released, declined or cancelled
 * included), ever named one of these Petak Makam or Kavling Keluarga. Those
 * columns carry no foreign key, so Inventory asks this before it removes a Blok:
 * an order must never be left pointing at a plot that no longer exists.
 */
export async function pernahMenyebutPetakAtauKavling(db: Database, ids: { petakIds: string[]; kavlingIds: string[] }): Promise<boolean> {
  const { petakIds, kavlingIds } = ids;
  if (petakIds.length === 0 && kavlingIds.length === 0) return false;
  const [saatDuka, terencana] = await Promise.all([
    petakIds.length > 0 ? db.select({ id: pemesananMakam.id }).from(pemesananMakam).where(inArray(pemesananMakam.petakId, petakIds)).limit(1) : [],
    db
      .select({ id: pemesananTerencanaUnit.id })
      .from(pemesananTerencanaUnit)
      .where(
        or(
          petakIds.length > 0 ? inArray(pemesananTerencanaUnit.petakId, petakIds) : undefined,
          kavlingIds.length > 0 ? inArray(pemesananTerencanaUnit.kavlingId, kavlingIds) : undefined,
        ),
      )
      .limit(1),
  ]);
  return saatDuka.length > 0 || terencana.length > 0;
}
