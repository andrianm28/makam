/**
 * Ambil: any Admin Platform soft-claims an Antrean row, visible to all and
 * takeable by anyone, including one already taken (spec, story 141). Every
 * Ambil is logged in the Audit Log (`antrean.ambil`), never in the Admin
 * Lokasi view (audit module, `HIDDEN_FROM_ADMIN_LOKASI`).
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { antreanResource, writeRefusal, type Actor, type Identity, type WriteRefusal } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { rowKeyOf } from "./antrean";
import { antreanAmbil } from "./schema";

export interface AmbilDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** Who took a row, as the family's order page shows them: the name and contact of the staff member handling it. */
  identity: Pick<Identity, "staffAccountById">;
}

export type AmbilRowResult = { ok: true; claimedAt: Date } | WriteRefusal;

/** `by` takes (Ambil) the row `${type}:${subjectId}`, replacing any earlier claim; audited. */
export async function ambilRow(deps: AmbilDeps, by: Actor, input: { type: string; subjectId: string }): Promise<AmbilRowResult> {
  const refusal = writeRefusal(by, "antrean.ambil", antreanResource());
  if (refusal) return refusal;
  const rowKey = rowKeyOf(input.type, input.subjectId);
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [existing] = await tx.select().from(antreanAmbil).where(eq(antreanAmbil.rowKey, rowKey));
    await tx
      .insert(antreanAmbil)
      .values({ rowKey, claimedByAccountId: by.accountId, claimedAt: now })
      .onConflictDoUpdate({
        target: antreanAmbil.rowKey,
        set: { claimedByAccountId: by.accountId, claimedAt: now },
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

/**
 * Who has Ambil'd a row, as the family's own order page shows them (spec, story
 * 73: "Admin Platform and TPU staff contacts"). Only a name and a contact number
 * of an Akun Staf, never a role, an email or a session: the point is that a
 * family in a bereavement has somebody to ring.
 */
export interface PengurusAmbil {
  /** Their name as the Akun carries it. */
  name: string;
  /** Their contact number, null when the Akun has none. */
  phoneNumber: string | null;
  claimedAt: Date;
}

/**
 * The staff member who has taken the row `${type}:${subjectId}`, or null when
 * nobody has. A read, never a write, and never logged: a family following its
 * order is not staff work.
 */
export async function ambilPengurus(
  deps: AmbilDeps,
  row: { type: string; subjectId: string },
): Promise<PengurusAmbil | null> {
  const [claim] = await deps.db
    .select()
    .from(antreanAmbil)
    .where(eq(antreanAmbil.rowKey, rowKeyOf(row.type, row.subjectId)));
  if (!claim) return null;
  const account = await deps.identity.staffAccountById(claim.claimedByAccountId);
  if (!account) return null;
  // An Akun Staf that has set no name is shown by its Email Terverifikasi rather
  // than as a blank: a family in a bereavement needs somebody they can ring, and
  // " " is nobody.
  const name = account.name.trim() || account.email || account.accountId;
  return { name, phoneNumber: account.phoneNumber, claimedAt: claim.claimedAt };
}
