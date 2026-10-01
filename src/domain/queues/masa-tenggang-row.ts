/**
 * "Hak Pakai in masa tenggang" (Lainnya): the Admin Lokasi's own list of Hak
 * Pakai that are Kedaluwarsa and still inside their Masa Tenggang, so the
 * Admin Lokasi decides whether to end them (spec, Work Queues; story 130). It
 * sits in Lainnya, not Mendesak: a right in its grace period is not urgent.
 *
 * The row is a plain projection of Inventory's own read, so it closes itself
 * when a Perpanjangan payment makes the Hak Pakai Aktif again or when it is
 * ended. The deadline is the last day of the Masa Tenggang.
 */
import { wib } from "@/lib/time/jakarta";
import type { AntreanLokasiRowType } from "./antrean-lokasi-rows";

export const hakPakaiMasaTenggangRowType: AntreanLokasiRowType = {
  key: "hak_pakai_masa_tenggang",
  grup: "lainnya",
  label: "Hak Pakai in masa tenggang",
  async rows(deps, _by, lokasiId) {
    const rows = await deps.inventory.hakPakaiMasaTenggang(lokasiId);
    return rows.map((satu) => ({
      type: "hak_pakai_masa_tenggang",
      label: "Hak Pakai in masa tenggang",
      subjectKind: "hak_pakai",
      subjectId: satu.hakPakaiId,
      subjectLabel: `${satu.subjectLabel} · berakhir ${satu.endDate}`,
      href: `/staf/admin-lokasi/${lokasiId}/denah`,
      deadline: wib(`${satu.masaTenggangSelesai} 23:59`),
    }));
  },
};
