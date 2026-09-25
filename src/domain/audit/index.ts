/**
 * Audit Log: one Entri Audit per staff write (who, under which role, when, to
 * what, before/after, reason). Reads are never recorded.
 *
 * Owns table: audit_entry.
 *
 * Other modules call `record` with their own transaction, so the entry exists
 * exactly when the write it describes commits.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import { auditEntry } from "./schema";

/** A JSON-serialisable snapshot of the entity before or after the write. */
export type AuditSnapshot = Record<string, unknown> | null;

export interface AuditEntity {
  /** e.g. "akun", "undangan_staf". */
  kind: string;
  id: string;
}

export interface NewAuditEntry {
  /** The Akun that did the write, and the role it acted under. */
  actor: { accountId: string; role: string };
  /** The Action name, as authorised (e.g. "staf.undang"). */
  action: string;
  entity: AuditEntity;
  before: AuditSnapshot;
  after: AuditSnapshot;
  reason: string | null;
}

export interface AuditEntry extends NewAuditEntry {
  id: string;
  at: Date;
}

export interface AuditLog {
  /** Records one Entri Audit on `db` (pass the write's own transaction), stamped with the Clock. */
  record(db: Database, entry: NewAuditEntry): Promise<void>;
  /** Every Entri Audit about one entity, oldest first. */
  entriesAbout(entity: AuditEntity): Promise<AuditEntry[]>;
}

export function createAuditLog(deps: { db: Database; clock: Clock }): AuditLog {
  return {
    async record(db, entry) {
      await db.insert(auditEntry).values({
        at: deps.clock.now(),
        actorAccountId: entry.actor.accountId,
        actorRole: entry.actor.role,
        action: entry.action,
        entityKind: entry.entity.kind,
        entityId: entry.entity.id,
        before: entry.before,
        after: entry.after,
        reason: entry.reason,
      });
    },
    async entriesAbout(entity) {
      const rows = await deps.db
        .select()
        .from(auditEntry)
        .where(and(eq(auditEntry.entityKind, entity.kind), eq(auditEntry.entityId, entity.id)))
        .orderBy(asc(auditEntry.at), asc(auditEntry.id));
      return rows.map(toEntry);
    },
  };
}

function toEntry(row: typeof auditEntry.$inferSelect): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actor: { accountId: row.actorAccountId, role: row.actorRole },
    action: row.action,
    entity: { kind: row.entityKind, id: row.entityId },
    before: (row.before as AuditSnapshot) ?? null,
    after: (row.after as AuditSnapshot) ?? null,
    reason: row.reason,
  };
}
