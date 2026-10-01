/**
 * Availability (spec, Inventory > Denah): the count of cleared Tersedia units
 * per Jenis Makam of a Lokasi Mitra, a Kavling Keluarga counting as one unit.
 * "Cleared" excludes a Petak still Perlu Verifikasi, even though its derived
 * status (no Hak Pakai yet) is nominally Tersedia, and a Kavling Keluarga any
 * of whose member Petak is still Perlu Verifikasi.
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
    const status = derivePetakStatus({ tidakTersediaReason: petak.tidakTersediaReason, hakPakai: forStatus(byPetak.get(petak.id) ?? null, petak.pembongkaranAt !== null) });
    if (status === "tersedia") bump(petak.jenisMakamId!);
  }

  const membersByKavling = new Map<string, number>();
  const dibongkarByKavling = new Map<string, number>();
  const unclearedKavling = new Set<string>();
  for (const petak of petakRows) {
    if (!petak.kavlingId) continue;
    membersByKavling.set(petak.kavlingId, (membersByKavling.get(petak.kavlingId) ?? 0) + 1);
    if (petak.pembongkaranAt) dibongkarByKavling.set(petak.kavlingId, (dibongkarByKavling.get(petak.kavlingId) ?? 0) + 1);
    if (petak.perluVerifikasi) unclearedKavling.add(petak.kavlingId);
  }
  for (const kavling of kavlingRows) {
    if (unclearedKavling.has(kavling.id)) continue;
    const totalPetak = membersByKavling.get(kavling.id) ?? 0;
    const petakDibongkar = dibongkarByKavling.get(kavling.id) ?? 0;
    const status = deriveKavlingStatus({
      hakPakai: forStatus(byKavling.get(kavling.id) ?? null, totalPetak > 0 && petakDibongkar >= totalPetak),
      totalPetak,
      petakWithPemakaman: 0,
      petakDibongkar,
    });
    if (status === "tersedia") bump(kavling.jenisMakamId);
  }

  return [...counts.entries()].map(([jenisMakamId, count]) => ({ jenisMakamId, count }));
}
