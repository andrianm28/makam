/**
 * The Antrean Lokasi itself (spec, Work Queues; ticket 23): the Admin Lokasi's
 * list of open work for one Lokasi Mitra, split into Mendesak and Lainnya and
 * sorted by deadline inside each group.
 *
 * It is the Antrean's own projection with the Antrean's machinery left out: rows
 * only, no Ambil claims, no tiers, no Bertugas and no counter strip. Adding a
 * row type means adding it to `./antrean-lokasi-rows.ts`; this aggregator and
 * the row list on the screen then need no change. A row type that asks the
 * staff member to do something in place adds its own control there, as the
 * failed-message row does with its "Catat panggilan" (`page.tsx`).
 */
import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import { antreanLokasiRowTypes, type AntreanLokasiRow } from "./antrean-lokasi-rows";
import type { AntreanRowDeps } from "./row-types";

export type { AntreanLokasiGrup, AntreanLokasiRow, AntreanLokasiRowType } from "./antrean-lokasi-rows";
export { antreanLokasiRowTypes } from "./antrean-lokasi-rows";

/** The counter strip the Antrean Lokasi shows above its two groups (ticket 23's AC 6). */
export interface AntreanLokasiStatistik {
  /** Orders confirmed after the deadline that Lokasi's Jam Operasional gave. */
  konfirmasiTerlambat: number;
}

export interface AntreanLokasiAntrean {
  /** Urgent work, soonest deadline first. */
  mendesak: AntreanLokasiRow[];
  /** Everything else, soonest deadline first; rows with no deadline last. */
  lainnya: AntreanLokasiRow[];
  statistik: AntreanLokasiStatistik;
}

/**
 * Every open row of one Lokasi Mitra, for its Admin Lokasi (Admin Platform may
 * read it as everywhere else in the staff area; anyone else gets an empty
 * list). Each row is marked past its own deadline at the Clock's now, and the
 * rows are projections: nothing here is stored, and a row disappears by itself
 * when the state it reads moves on.
 */
export async function antreanLokasi(
  deps: AntreanRowDeps,
  by: Actor,
  lokasiId: string,
): Promise<AntreanLokasiAntrean> {
  const kosong: AntreanLokasiAntrean = { mendesak: [], lainnya: [], statistik: { konfirmasiTerlambat: 0 } };
  if (!authorize(by, "pemesanan.lihat_staf", lokasiMitraResource(lokasiId)).allowed) return kosong;

  const now = deps.clock.now();
  const perGrup = await Promise.all(
    antreanLokasiRowTypes.map(async (rowType) => {
      const rows = await rowType.rows(deps, by, lokasiId);
      return rows.map((row) => ({ ...row, pastDeadline: row.deadline !== null && row.deadline.getTime() < now.getTime() }));
    }),
  );
  const semua = perGrup.flat();
  const urut = (satu: AntreanLokasiRow, lain: AntreanLokasiRow) => {
    const a = satu.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
    const b = lain.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
    return a - b;
  };
  return {
    mendesak: semua.filter((row) => barisMendesak(row.type)).sort(urut),
    lainnya: semua.filter((row) => !barisMendesak(row.type)).sort(urut),
    statistik: { konfirmasiTerlambat: await deps.pemesanan.konfirmasiTerlambat(lokasiId) },
  };
}

/** Whether a row type is one of the Mendesak ones (the group is the row type's own declaration). */
function barisMendesak(type: string): boolean {
  return antreanLokasiRowTypes.some((rowType) => rowType.key === type && rowType.grup === "mendesak");
}
