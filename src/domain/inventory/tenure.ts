import type { Tenure } from "@/domain/tariffs";
import type { Actor } from "@/domain/identity";
import type { InventoryDeps } from "./deps";

/** The tenure (Selamanya or N years) in force for a Jenis Makam, or null when it (or its Lokasi) can't be seen. */
export async function tenureOfJenisMakam(deps: InventoryDeps, by: Actor, lokasiId: string, jenisMakamId: string): Promise<Tenure | null> {
  const tariffs = await deps.tariffs.asStaff(by).lokasiTariffs(lokasiId, deps.clock.now());
  const jenisMakam = tariffs.jenisMakam.find((one) => one.id === jenisMakamId);
  return jenisMakam?.inForce?.tenure ?? null;
}

/**
 * `startOn` ("YYYY-MM-DD") plus `years` whole calendar years, "YYYY-MM-DD" (a
 * fixed-term Hak Pakai's end date once its tenure clock has started). Plain
 * calendar arithmetic on the date's own fields: no time zone is involved, a
 * WIB calendar date plus N years is the same calendar date N years later.
 */
export function addYears(startOn: string, years: number): string {
  const [year, month, day] = startOn.split("-").map(Number);
  const target = new Date(Date.UTC(year + years, month - 1, day));
  return target.toISOString().slice(0, 10);
}
