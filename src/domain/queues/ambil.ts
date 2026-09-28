/**
 * Ambil: any Admin Platform soft-claims an Antrean row, visible to all and
 * takeable by anyone, including one already taken (spec, story 141). Every
 * Ambil is logged in the Audit Log (`antrean.ambil`), never in the Admin
 * Lokasi view (audit module, `HIDDEN_FROM_ADMIN_LOKASI`).
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { antreanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { rowKeyOf } from "./antrean";
import { antreanAmbil } from "./schema";

export interface AmbilDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
}

export type AmbilRowResult = { ok: true; claimedAt: Date } | WriteRefusal;

/** The row to take: its type and subject, plus the `subjectKind` its Catatan Internal thread is keyed on (a hand-over writes that thread, ticket 28). */
export interface AmbilRowInput {
  type: string;
  subjectId: string;
  subjectKind?: string;
}

/** `by` takes (Ambil) the row `${type}:${subjectId}`, replacing any earlier claim; audited. */
export async function ambilRow(deps: AmbilDeps, by: Actor, input: AmbilRowInput): Promise<AmbilRowResult> {
  const refusal = writeRefusal(by, "antrean.ambil", antreanResource());
  if (refusal) return refusal;
  const rowKey = rowKeyOf(input.type, input.subjectId);
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [existing] = await tx.select().from(antreanAmbil).where(eq(antreanAmbil.rowKey, rowKey));
    await tx
      .insert(antreanAmbil)
      .values({ rowKey, subjectKind: input.subjectKind ?? null, claimedByAccountId: by.accountId, claimedAt: now })
      .onConflictDoUpdate({
        target: antreanAmbil.rowKey,
        set: { subjectKind: input.subjectKind ?? null, claimedByAccountId: by.accountId, claimedAt: now },
      });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "antrean.ambil",
      entity: { kind: "antrean_row", id: rowKey },
      lokasiId: null,
      before: existing ? { claimedByAccountId: existing.claimedByAccountId } : null,
      after: { claimedByAccountId: by.accountId },
      reason: null,
    });
    return { ok: true, claimedAt: now } as const;
  });
}
