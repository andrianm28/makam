/**
 * Tier 2 "Ambil surat pengantar" (spec, Work Queues: "unassigned or overdue
 * Ambil surat pengantar"; ticket 45, AC 5). The Operator fetches the letter from
 * the TPU itself on the burial day, so the family never carries it, and the
 * filing is stuck without it: a Tugas nobody picked up in time needs someone to
 * hand it to.
 *
 * The row reads the Field Work module's own open Ambil surat pengantar tasks,
 * so it closes the moment the Petugas completes one and needs no change here.
 * Its deadline is the end of the burial day the task was planned for, so a task
 * still open the next morning reads as overdue rather than as work in hand.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

/** The Admin Platform's list of every Tugas Lapangan, where an unclaimed one is reassigned. */
export const TUGAS_LAPANGAN_HREF = "/staf/admin-platform/tugas-lapangan";

export const ambilSuratPengantarRowType: AntreanRowType = {
  key: "ambil_surat_pengantar",
  tier: 2,
  label: "Ambil surat pengantar",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const tugas = await deps.fieldwork.ambilSuratPengantarTerbuka();
    return tugas.map((satu) => ({
      subjectKind: "fieldwork_tugas",
      subjectId: satu.id,
      subjectLabel: `${satu.subject} · ${satu.plannedDate}`,
      href: TUGAS_LAPANGAN_HREF,
      deadline: satu.dueAt,
    }));
  },
};
