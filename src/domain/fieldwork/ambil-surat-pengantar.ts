/**
 * The open "Ambil surat pengantar" tasks (spec, Field Work; ticket 45): the
 * letter the Operator fetches from a TPU itself on the burial day, which the
 * family never carries and the IPTM filing is stuck without.
 *
 * A read the Antrean's Tier 2 row is a projection of, so a task completed by its
 * Petugas closes the row with no change to the queue. The deadline is the end of
 * the day the burial was planned for: past it nobody has collected the letter,
 * and someone in the office has to.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { wib } from "@/lib/time/jakarta";
import { fieldworkTugas } from "./schema";

/** One open "Ambil surat pengantar" Tugas, as the Tier 2 row reads it. */
export interface AmbilSuratPengantarTerbuka {
  id: string;
  subject: string;
  plannedDate: string;
  /** End of the planned day, in WIB: past it, the letter has not been collected. */
  dueAt: Date;
  assigneeAccountId: string;
}

/** Every "Ambil surat pengantar" Tugas still Ditugaskan, soonest burial day first. */
export async function ambilSuratPengantarTerbuka(deps: { db: Database }): Promise<AmbilSuratPengantarTerbuka[]> {
  const rows = await deps.db
    .select({
      id: fieldworkTugas.id,
      subject: fieldworkTugas.subject,
      plannedDate: fieldworkTugas.plannedDate,
      assigneeAccountId: fieldworkTugas.assigneeAccountId,
    })
    .from(fieldworkTugas)
    .where(and(eq(fieldworkTugas.type, "ambil_surat_pengantar"), eq(fieldworkTugas.status, "ditugaskan")))
    .orderBy(asc(fieldworkTugas.plannedDate), asc(fieldworkTugas.id));
  return rows.map((row) => ({
    id: row.id,
    subject: row.subject,
    plannedDate: row.plannedDate,
    assigneeAccountId: row.assigneeAccountId,
    // The day is already a WIB calendar date, so the end of it is built from it
    // and never from the Clock's now: the deadline is the task's own.
    dueAt: wib(`${row.plannedDate} 23:59`),
  }));
}
