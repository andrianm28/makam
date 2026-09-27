/**
 * The two Tier 4 row types that follow one Lokasi Mitra revisit (spec, Work
 * Queues; ticket 17, "the Tier 4 revisit trigger" and its comment of
 * 2026-09-25): both exist only after Admin Platform presses "Minta kunjungan
 * ulang" on a Lokasi Mitra that is already published (not Belum Tayang), which
 * creates its Kunjungan Verifikasi Tugas Lapangan (ticket 15). Neither ever
 * opens for the onboarding visit, because that one completes (and stays open)
 * only while the Lokasi is still Belum Tayang, which both rows exclude.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { addWibDays, wib } from "@/lib/time/jakarta";

const lokasiHref = (lokasiId: string) => `/staf/admin-platform/lokasi/${lokasiId}`;

/** A Tugas Lapangan's planned WIB calendar date, as the instant it becomes overdue (the start of the next WIB day). */
function overdueFrom(plannedDate: string): Date {
  return addWibDays(wib(plannedDate), 1);
}

/**
 * Open while a Kunjungan Verifikasi Tugas Lapangan requested by "Minta
 * kunjungan ulang" is not yet Selesai (spec, Work Queues; ticket 17): any open
 * (Ditugaskan) Kunjungan Verifikasi for a Lokasi Mitra that is not Belum
 * Tayang, since during onboarding the Lokasi is Belum Tayang for as long as
 * its first Kunjungan Verifikasi stays open.
 */
export const lokasiRevisitRowType: AntreanRowType = {
  key: "lokasi_kunjungan_ulang",
  tier: 4,
  label: "Kunjungan ulang Lokasi",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const [tugas, lokasiMitra] = await Promise.all([deps.fieldwork.allTugasLapangan(by), deps.lokasi.allLokasiMitra(by)]);
    const lokasiById = new Map(lokasiMitra.map((item) => [item.id, item]));
    const rows: RawAntreanRow[] = [];
    for (const item of tugas) {
      if (item.type !== "kunjungan_verifikasi" || item.status !== "ditugaskan" || !item.lokasiId) continue;
      const lokasi = lokasiById.get(item.lokasiId);
      if (!lokasi || lokasi.status === "belum_tayang") continue;
      rows.push({
        subjectKind: "lokasi_mitra",
        subjectId: item.lokasiId,
        subjectLabel: lokasi.name,
        href: lokasiHref(item.lokasiId),
        deadline: overdueFrom(item.plannedDate),
      });
    }
    return rows;
  },
};

/**
 * Open from a revisit's Kunjungan Verifikasi Selesai until Admin Platform
 * records that the Lokasi still meets the publish gate (spec, Work Queues;
 * ticket 17): the Lokasi's latest completed Kunjungan Verifikasi after it was
 * first published, compared with its last "masih memenuhi syarat tayang"
 * confirmation (`lokasi.recordPublishGateMasihTerpenuhi`). The Lokasi's own
 * publish moment (`publishedAt`) is what keeps the initial onboarding visit
 * from ever opening this row.
 */
export const publishGateCheckRowType: AntreanRowType = {
  key: "lokasi_syarat_tayang_ulang",
  tier: 4,
  label: "Cek ulang syarat tayang",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const [tugas, lokasiMitra] = await Promise.all([deps.fieldwork.allTugasLapangan(by), deps.lokasi.allLokasiMitra(by)]);
    const latestRevisitCompletionByLokasi = new Map<string, Date>();
    for (const item of tugas) {
      if (item.type !== "kunjungan_verifikasi" || item.status !== "selesai" || !item.lokasiId || !item.completedAt) continue;
      const current = latestRevisitCompletionByLokasi.get(item.lokasiId);
      if (!current || item.completedAt > current) latestRevisitCompletionByLokasi.set(item.lokasiId, item.completedAt);
    }
    const rows: RawAntreanRow[] = [];
    for (const lokasi of lokasiMitra) {
      if (lokasi.status === "belum_tayang" || !lokasi.publishedAt) continue;
      const latestCompletedAt = latestRevisitCompletionByLokasi.get(lokasi.id);
      if (!latestCompletedAt || latestCompletedAt <= lokasi.publishedAt) continue;
      if (lokasi.publishGateRecheckedAt && lokasi.publishGateRecheckedAt >= latestCompletedAt) continue;
      rows.push({
        subjectKind: "lokasi_mitra",
        subjectId: lokasi.id,
        subjectLabel: lokasi.name,
        href: lokasiHref(lokasi.id),
        deadline: latestCompletedAt,
      });
    }
    return rows;
  },
};
