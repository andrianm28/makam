/**
 * Tier 3 "IPTM filing" (spec, Work Queues: "Tier 3: … IPTM filing (7 days)"; ticket 46). A Saat Duka TPU
 * order whose filing documents Admin Platform has checked (Dokumen Lengkap) waits here until the IPTM is
 * filed on JakEVO. A plain projection of the Pengurusan module's own state: the row closes when the
 * order's status moves on, and its deadline is the 7 days the module computed from Dokumen Lengkap.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

export const IPTM_FILING_TYPE = "iptm_diajukan";

/** Where an Admin Platform files the IPTM; the row links to the order under it. */
export const IPTM_FILING_HREF = "/staf/admin-platform/pengurusan";

/** One filing row of a Pengurusan order, shared by every Tier 3 filing row (the 7-day one, and the filing-only two of ticket 47). */
export function barisPengurusan(order: { id: string; nomor: string; almarhumName: string | null; tpuName: string; dueAt: Date }): RawAntreanRow {
  return {
    subjectKind: "pengurusan_tpu",
    subjectId: order.id,
    subjectLabel: order.almarhumName ? `${order.nomor} · ${order.almarhumName} · ${order.tpuName}` : `${order.nomor} · ${order.tpuName}`,
    href: `${IPTM_FILING_HREF}/${order.nomor}`,
    deadline: order.dueAt,
  };
}

export const iptmFilingRowType: AntreanRowType = {
  key: IPTM_FILING_TYPE,
  tier: 3,
  label: "IPTM filing",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const terbuka = await deps.pengurusan.pengajuanIptmTerbuka();
    return terbuka.map(barisPengurusan);
  },
};
