/**
 * Availability (spec, Inventory > Denah): the count of cleared Tersedia units
 * per Jenis Makam of a Lokasi Mitra, a Kavling Keluarga counting as one unit.
 * "Cleared" excludes a Petak still Perlu Verifikasi, even though its derived
 * status (no Hak Pakai yet) is nominally Tersedia.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { forStatus, hakPakaiByTarget } from "./hak-pakai-reads";
import { inventoryKavling, inventoryPetak } from "./schema";
import { deriveKavlingStatus, derivePetakStatus } from "./status";

export interface AvailabilityCount {
  jenisMakamId: string;
  count: number;
}

/** Every Jenis Makam's count of cleared Tersedia units at a Lokasi Mitra (a Kavling Keluarga counts as one). */
export async function availability(db: Database, lokasiId: string): Promise<AvailabilityCount[]> {
  const [petakRows, kavlingRows, { byPetak, byKavling }] = await Promise.all([
    db.select().from(inventoryPetak).where(eq(inventoryPetak.lokasiId, lokasiId)),
    db.select().from(inventoryKavling).where(eq(inventoryKavling.lokasiId, lokasiId)),
    hakPakaiByTarget(db, lokasiId),
  ]);

  const counts = new Map<string, number>();
  const bump = (jenisMakamId: string) => counts.set(jenisMakamId, (counts.get(jenisMakamId) ?? 0) + 1);

  for (const petak of petakRows) {
    if (petak.kind !== "petak" || petak.kavlingId) continue;
    if (petak.perluVerifikasi) continue;
    const status = derivePetakStatus({ tidakTersediaReason: petak.tidakTersediaReason, hakPakai: forStatus(byPetak.get(petak.id) ?? null) });
    if (status === "tersedia") bump(petak.jenisMakamId!);
  }

  const membersByKavling = new Map<string, number>();
  for (const petak of petakRows) {
    if (!petak.kavlingId) continue;
    membersByKavling.set(petak.kavlingId, (membersByKavling.get(petak.kavlingId) ?? 0) + 1);
  }
  for (const kavling of kavlingRows) {
    const status = deriveKavlingStatus({ hakPakai: forStatus(byKavling.get(kavling.id) ?? null), totalPetak: membersByKavling.get(kavling.id) ?? 0, petakWithPemakaman: 0 });
    if (status === "tersedia") bump(kavling.jenisMakamId);
  }

  return [...counts.entries()].map(([jenisMakamId, count]) => ({ jenisMakamId, count }));
}
