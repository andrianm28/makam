/**
 * Tier 1 "Konfirmasi TPU Saat Duka" (spec, Work Queues: "Tier 1: Konfirmasi TPU
 * Saat Duka (2 service hours)"; ticket 45, AC 1). A Saat Duka TPU order sits
 * here from the moment it is submitted until Admin Platform has arranged the
 * burial with the TPU, because until then nobody has promised the family
 * anything and the family is waiting on a death.
 *
 * The row is a plain projection of the Pengurusan module's own state and needs
 * no change to close: it disappears the moment the order is confirmed, offered
 * another TPU and answered, or cancelled — the module's own reads decide which,
 * and the order's status is the single thing this row looks at.
 *
 * Its deadline is the order's own `konfirmasiDueAt`, the two service hours the
 * TPU window promised at submission, so the row is already past its deadline by
 * the time it appears as "late" and the escalation (tickets 28: 30 min, 90 min,
 * and a 06:00 alert for a night row) counts from a fact the order already
 * carries rather than from when the row was first read.
 */
import type { Tier1Row, Tier1RowDeps, Tier1RowType } from "./row-types";

export const KONFIRMASI_TPU_SAAT_DUKA_TYPE = "konfirmasi_tpu_saat_duka";

/** Where an Admin Platform confirms the order; the page the row links to. */
export const KONFIRMASI_TPU_HREF = "/staf/admin-platform/pengurusan";

export const konfirmasiTpuSaatDukaRowType: Tier1RowType = {
  key: KONFIRMASI_TPU_SAAT_DUKA_TYPE,
  tier: 1,
  label: "Konfirmasi TPU Saat Duka",
  // Ticket 28's hooks: a night row is alerted at 06:00, and everyone is alerted
  // again 90 min after the first alert while it is still unconfirmed.
  tundaMalam: true,
  eskalasiLanjutMenit: 90,
  async rows(deps: Tier1RowDeps): Promise<Tier1Row[]> {
    const terbuka = await deps.pengurusan.konfirmasiTpuTerbuka();
    return terbuka.map((order) => ({
      subjectKind: "pengurusan_tpu",
      subjectId: order.id,
      subjectLabel: `${order.nomor} · ${order.almarhumName} · ${order.tpuName}`,
      href: `${KONFIRMASI_TPU_HREF}/${order.nomor}`,
      deadline: order.konfirmasiDueAt,
      // The row appears when the family submits the order.
      sejak: order.diajukanAt,
    }));
  },
};
