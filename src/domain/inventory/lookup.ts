/**
 * Lookup by Nomor Makam, including an old (renumbered) one kept as a hidden
 * alias (spec, Inventory > Denah; story 169): Perpanjangan, the Makam
 * keluarga hub and the Admin Lokasi search all resolve through this so a
 * renumber never breaks them. The alias itself is never returned or shown —
 * only the Petak's current Nomor Makam is.
 */
import { and, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { foldKey } from "./ids";
import { inventoryPetak, inventoryPetakAlias } from "./schema";

export interface PetakByNomor {
  petakId: string;
  nomorMakam: string;
}

/** The Petak named `nomor` at `lokasiId`, by its current Nomor Makam or an earlier one it was renumbered from; null when neither names one. */
export async function findPetakByNomor(db: Database, lokasiId: string, nomor: string): Promise<PetakByNomor | null> {
  const key = foldKey(nomor);
  const [live] = await db
    .select({ id: inventoryPetak.id, nomorMakam: inventoryPetak.nomorMakam })
    .from(inventoryPetak)
    .where(and(eq(inventoryPetak.lokasiId, lokasiId), eq(inventoryPetak.nomorMakamKey, key)));
  if (live) return { petakId: live.id, nomorMakam: live.nomorMakam! };

  const [alias] = await db
    .select({ petakId: inventoryPetakAlias.petakId })
    .from(inventoryPetakAlias)
    .where(and(eq(inventoryPetakAlias.lokasiId, lokasiId), eq(inventoryPetakAlias.nomorMakamKey, key)));
  if (!alias) return null;
  const [current] = await db.select({ id: inventoryPetak.id, nomorMakam: inventoryPetak.nomorMakam }).from(inventoryPetak).where(eq(inventoryPetak.id, alias.petakId));
  return current ? { petakId: current.id, nomorMakam: current.nomorMakam! } : null;
}
