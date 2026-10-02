/**
 * Tier 3 "Pengajuan Wakaf" (spec, Work Queues: "Pengajuan Wakaf (first contact in 3 working days; no
 * alert)"; ticket 58). A new Pengajuan waits here for Admin Platform's first contact and leaves the
 * moment it is moved on from Diajukan, so the row is a plain projection of the Wakaf module's own
 * open Pengajuan. It is Tier 3, so it never alerts.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

export const PENGAJUAN_WAKAF_HREF = "/staf/admin-platform/wakaf";

export const pengajuanWakafRowType: AntreanRowType = {
  key: "pengajuan_wakaf",
  tier: 3,
  label: "Pengajuan Wakaf",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const terbuka = (await deps.wakaf?.pengajuanTerbuka()) ?? [];
    return terbuka.map((pengajuan) => ({
      subjectKind: "pengajuan_wakaf",
      subjectId: pengajuan.id,
      subjectLabel: `${pengajuan.nomor} · ${pengajuan.wakifNama} · ${pengajuan.kabKota}`,
      href: `${PENGAJUAN_WAKAF_HREF}/${pengajuan.id}`,
      deadline: pengajuan.tenggatPada,
    }));
  },
};
