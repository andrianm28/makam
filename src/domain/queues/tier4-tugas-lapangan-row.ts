/**
 * Tier 4 "other Tugas Lapangan" (spec, Work Queues): every open Tugas Lapangan
 * that is unassigned or overdue, except Ambil surat pengantar (Tier 2, a
 * later ticket's row) and a Kunjungan Verifikasi already covered by the
 * Lokasi-revisit row (`./tier4-lokasi-rows.ts`).
 */
import { addWibDays, wib, wibDateOf } from "@/lib/time/jakarta";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

function overdueFrom(plannedDate: string): Date {
  return addWibDays(wib(plannedDate), 1);
}

export const otherTugasLapanganRowType: AntreanRowType = {
  key: "tugas_lapangan_lain",
  tier: 4,
  label: "Tugas Lapangan lain",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const [tugas, lokasiMitra] = await Promise.all([deps.fieldwork.allTugasLapangan(by), deps.lokasi.allLokasiMitra(by)]);
    const lokasiById = new Map(lokasiMitra.map((item) => [item.id, item]));
    const today = wibDateOf(deps.clock.now());
    const rows: RawAntreanRow[] = [];
    for (const item of tugas) {
      if (item.status !== "ditugaskan") continue;
      if (item.type === "ambil_surat_pengantar") continue;
      if (item.type === "kunjungan_verifikasi" && item.lokasiId) {
        const lokasi = lokasiById.get(item.lokasiId);
        if (lokasi && lokasi.status !== "belum_tayang") continue;
      }
      const unassigned = item.assigneeAccountId.trim() === "";
      const overdue = item.plannedDate < today;
      if (!unassigned && !overdue) continue;
      rows.push({
        subjectKind: "tugas_lapangan",
        subjectId: item.id,
        subjectLabel: item.subject,
        href: "/staf/admin-platform/tugas-lapangan",
        deadline: overdueFrom(item.plannedDate),
      });
    }
    return rows;
  },
};
