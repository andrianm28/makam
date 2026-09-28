/**
 * Catatan Internal (CONTEXT.md): a staff-only note on an Antrean row or an
 * order, for hand-over; never shown to the Pemesan, Mitra Jasa or Admin
 * Lokasi (spec, Work Queues). Admin Platform only, both to write and to read.
 */
import { asc, and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { antreanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { catatanInternal as catatanInternalTable } from "./schema";

export interface CatatanInternalDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

export const catatanInternalInputSchema = z.object({
  subjectKind: z.string().trim().min(1).max(50),
  subjectId: z.string().trim().min(1).max(100),
  body: z.string().trim().min(1).max(2000),
});
export type CatatanInternalInput = z.infer<typeof catatanInternalInputSchema>;

export interface CatatanInternal {
  id: string;
  subjectKind: string;
  subjectId: string;
  authorAccountId: string;
  /** True when the platform wrote the note itself (the Bertugas auto-off's hand-over note): the thread must not put a person's name on it. */
  olehPlatform: boolean;
  body: string;
  createdAt: Date;
}

export type TambahCatatanInternalResult = { ok: true; catatan: CatatanInternal } | WriteRefusal | { ok: false; reason: "catatan_tidak_valid" };

/** One note, written inside the calling write's own transaction; its Entri Audit is the caller's to record. */
export async function catatTulis(
  tx: Database,
  note: { authorAccountId: string; subjectKind: string; subjectId: string; body: string; now: Date },
): Promise<string> {
  const [row] = await tx
    .insert(catatanInternalTable)
    .values({ ...barisDari(note), olehPlatform: false })
    .returning({ id: catatanInternalTable.id });
  return row.id;
}

/**
 * One note the platform wrote itself, in the same shape: the Bertugas auto-off leaves each claim alone
 * and says so where the work is (ticket 28). Nobody signed in, so `authorAccountId` names the Akun the
 * note is *about* — whose duty ended — and `olehPlatform` is what the thread reads to show the platform
 * as the author instead of a name.
 */
export async function catatOtomatis(
  tx: Database,
  note: { authorAccountId: string; subjectKind: string; subjectId: string; body: string; now: Date },
): Promise<string> {
  const [row] = await tx
    .insert(catatanInternalTable)
    .values({ ...barisDari(note), olehPlatform: true })
    .returning({ id: catatanInternalTable.id });
  return row.id;
}

function barisDari(note: { authorAccountId: string; subjectKind: string; subjectId: string; body: string; now: Date }) {
  return {
    authorAccountId: note.authorAccountId,
    subjectKind: note.subjectKind,
    subjectId: note.subjectId,
    body: note.body,
    createdAt: note.now,
  };
}

/** Admin Platform adds a Catatan Internal on any row or order (`subjectKind` + `subjectId`, free text on both sides); audited. */
export async function tambahCatatanInternal(
  deps: CatatanInternalDeps,
  by: Actor,
  input: CatatanInternalInput,
): Promise<TambahCatatanInternalResult> {
  const refusal = writeRefusal(by, "catatan_internal.tambah", antreanResource());
  if (refusal) return refusal;
  const parsed = catatanInternalInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "catatan_tidak_valid" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const id = await catatTulis(tx, { authorAccountId: by.accountId, ...parsed.data, now });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "catatan_internal.tulis",
      entity: { kind: "catatan_internal", id },
      lokasiId: null,
      before: null,
      after: { subjectKind: parsed.data.subjectKind, subjectId: parsed.data.subjectId },
      reason: null,
    });
    const [row] = await tx.select().from(catatanInternalTable).where(eq(catatanInternalTable.id, id));
    return { ok: true, catatan: toCatatanInternal(row) } as const;
  });
}

/** Every Catatan Internal on one subject, oldest first; Admin Platform only, empty for anyone else (never the Pemesan, Mitra Jasa or Admin Lokasi). */
export async function catatanInternalFor(
  deps: CatatanInternalDeps,
  by: Actor,
  subjectKind: string,
  subjectId: string,
): Promise<CatatanInternal[]> {
  if (writeRefusal(by, "antrean.lihat", antreanResource())) return [];
  const rows = await deps.db
    .select()
    .from(catatanInternalTable)
    .where(and(eq(catatanInternalTable.subjectKind, subjectKind), eq(catatanInternalTable.subjectId, subjectId)))
    .orderBy(asc(catatanInternalTable.createdAt), asc(catatanInternalTable.id));
  return rows.map(toCatatanInternal);
}

function toCatatanInternal(row: typeof catatanInternalTable.$inferSelect): CatatanInternal {
  return {
    id: row.id,
    subjectKind: row.subjectKind,
    subjectId: row.subjectId,
    authorAccountId: row.authorAccountId,
    olehPlatform: row.olehPlatform,
    body: row.body,
    createdAt: row.createdAt,
  };
}
