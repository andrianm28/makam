/**
 * Shared plumbing for the Antrean's Tier 4 row types (`./tier4-lokasi-rows.ts`,
 * `./tier4-tugas-lapangan-row.ts`; ticket 17 review): the one overdue rule and
 * the one bulk read every Tier 4 type starts from, so the three row types
 * never repeat either.
 */
import type { TugasLapangan } from "@/domain/fieldwork";
import type { Actor } from "@/domain/identity";
import type { LokasiMitraSummary } from "@/domain/lokasi";
import { addWibDays, wib } from "@/lib/time/jakarta";
import type { AntreanRowDeps } from "./row-types";

/** A Tugas Lapangan's planned WIB calendar date, as the instant it becomes overdue (the start of the next WIB day). */
export function overdueFrom(plannedDate: string): Date {
  return addWibDays(wib(plannedDate), 1);
}

export interface TugasAndLokasi {
  tugas: TugasLapangan[];
  lokasiMitra: LokasiMitraSummary[];
  lokasiById: Map<string, LokasiMitraSummary>;
}

/** Every Tugas Lapangan and every Lokasi Mitra, the latter also keyed by id, in one round trip. */
export async function fetchTugasAndLokasi(
  deps: Pick<AntreanRowDeps, "fieldwork" | "lokasi">,
  by: Actor,
): Promise<TugasAndLokasi> {
  const [tugas, lokasiMitra] = await Promise.all([deps.fieldwork.allTugasLapangan(by), deps.lokasi.allLokasiMitra(by)]);
  return { tugas, lokasiMitra, lokasiById: new Map(lokasiMitra.map((item) => [item.id, item])) };
}
