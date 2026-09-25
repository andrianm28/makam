/**
 * Audit Log: one Entri Audit per staff write (who, under which role, when, to
 * what, before/after, reason). Reads are never recorded.
 *
 * Owns table: audit_entry (append-only: the database refuses UPDATE and DELETE).
 *
 * A staff write goes through `staffWrite`, the only way to record an entry: it
 * runs the write and its entries in one transaction, and refuses to commit a
 * write that recorded none.
 */
import { and, asc, eq, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Role } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { auditEntry } from "./schema";

/** A JSON-serialisable snapshot of the entity before or after the write. */
export type AuditSnapshot = Record<string, unknown> | null;

export interface AuditEntity {
  /** e.g. "akun", "undangan_staf". */
  kind: string;
  id: string;
}

/** The role the actor wrote under: a role it holds, or an ops command run on the server (no one signed in). */
export type AuditActorRole = Role | "seed_cli" | "ops_cli";

/** Every staff write that is audited. Later tickets add theirs here. */
export type AuditAction =
  /** `seed:admin`: the first Admin Platform. */
  | "staf.seed_admin_platform"
  /** Admin Platform sends an Undangan Staf. */
  | "staf.undang"
  /** An accepted Undangan Staf grants its role to the Akun. */
  | "staf.peran_diberikan"
  /** Admin Platform deactivates an Akun Staf. */
  | "staf.nonaktifkan"
  /** Admin Platform removes an Admin Lokasi from one Lokasi Mitra. */
  | "staf.lepas_admin_lokasi"
  /** Pindah Nomor. */
  | "akun.pindah_nomor"
  /** Admin Platform completes TOTP enrolment. */
  | "akun.totp_daftar"
  /** `reset-totp`: ops clears an Admin Platform's TOTP enrolment. */
  | "akun.totp_reset"
  /** Admin Platform changes Pengaturan Operator. */
  | "pengaturan_operator.ubah"
  /** An Akun Staf turns push on for a Perangkat Push. */
  | "akun.push_aktifkan"
  /** An Akun Staf turns push off for a Perangkat Push. */
  | "akun.push_matikan"
  /** An Akun Staf verifies its email, the same one or a new one (Verifikasi Email; never the code). */
  | "akun.email_verifikasi"
  /** Admin Platform creates a Lokasi Mitra (Belum Tayang). */
  | "lokasi.buat"
  /** Admin Platform edits a Lokasi Mitra's document checklist. */
  | "lokasi.ubah_dokumen"
  /** Admin Platform sets a Lokasi Mitra's policies and flags. */
  | "lokasi.ubah_kebijakan"
  /** Admin Platform sets or changes a Lokasi Mitra's bank account. */
  | "lokasi.ubah_rekening"
  /** Admin Platform uploads a Lokasi Mitra's agreement scan and signing date. */
  | "lokasi.unggah_perjanjian"
  /** A Catatan Internal is written (tickets 17, 23): never in the Admin Lokasi view. */
  | "catatan_internal.tulis"
  /** Admin Platform takes (Ambil) an Antrean row (ticket 17): never in the Admin Lokasi view. */
  | "antrean.ambil";

/**
 * What the Admin Lokasi view of a Lokasi's Audit Log leaves out (spec, Audit
 * Log): Catatan Internal and Antrean claims.
 */
const HIDDEN_FROM_ADMIN_LOKASI: readonly AuditAction[] = ["catatan_internal.tulis", "antrean.ambil"];

export interface NewAuditEntry {
  /** The Akun that did the write, and the role it acted under. */
  actor: { accountId: string; role: AuditActorRole };
  action: AuditAction;
  entity: AuditEntity;
  /**
   * The Lokasi Mitra the write belongs to, if any: set it on every write about
   * a Lokasi (its record, tariffs, status, its Admin Lokasi, its orders), so
   * the Lokasi's Admin Lokasi see it in `entriesForLokasi`.
   */
  lokasiId?: string | null;
  before: AuditSnapshot;
  after: AuditSnapshot;
  reason: string | null;
}

export interface AuditEntry extends NewAuditEntry {
  id: string;
  at: Date;
  lokasiId: string | null;
}

/** Records one Entri Audit in the staff write's transaction, stamped with the Clock. */
export type RecordEntry = (entry: NewAuditEntry) => Promise<void>;

/** Thrown when a staff write tries to commit without an Entri Audit: nothing is kept. */
export class UnauditedStaffWrite extends Error {
  constructor() {
    super("A staff write must record an Entri Audit before it commits");
    this.name = "UnauditedStaffWrite";
  }
}

export interface AuditLog {
  /**
   * Runs one staff write in a transaction on `db`, with `record` for its Entri
   * Audit. A result `{ ok: false }` is a refusal: everything is rolled back and
   * the result returned. A result `{ ok: true }` commits only if at least one
   * entry was recorded; otherwise nothing is kept and `UnauditedStaffWrite` is thrown.
   */
  staffWrite<T extends { ok: boolean }>(db: Database, write: (tx: Database, record: RecordEntry) => Promise<T>): Promise<T>;
  /** Every Entri Audit about one entity, oldest first. */
  entriesAbout(entity: AuditEntity): Promise<AuditEntry[]>;
  /** The whole Audit Log, oldest first (Admin Platform's `audit.lihat`). */
  allEntries(): Promise<AuditEntry[]>;
  /**
   * The Audit Log of one Lokasi Mitra as its Admin Lokasi see it, oldest
   * first: every entry about that Lokasi except Catatan Internal and Antrean claims.
   */
  entriesForLokasi(lokasiId: string): Promise<AuditEntry[]>;
}

/** Carries a refusal out of the transaction so that it rolls back. */
class Refused<T> extends Error {
  constructor(readonly result: T) {
    super("staff write refused");
  }
}

export function createAuditLog(deps: { db: Database; clock: Clock }): AuditLog {
  return {
    async staffWrite(db, write) {
      try {
        return await db.transaction(async (tx) => {
          let recorded = 0;
          const record: RecordEntry = async (entry) => {
            await tx.insert(auditEntry).values({
              at: deps.clock.now(),
              actorAccountId: entry.actor.accountId,
              actorRole: entry.actor.role,
              action: entry.action,
              entityKind: entry.entity.kind,
              entityId: entry.entity.id,
              lokasiId: entry.lokasiId ?? null,
              before: entry.before,
              after: entry.after,
              reason: entry.reason,
            });
            recorded++;
          };
          const result = await write(tx, record);
          if (!result.ok) throw new Refused(result);
          if (recorded === 0) throw new UnauditedStaffWrite();
          return result;
        });
      } catch (error) {
        if (error instanceof Refused) return error.result;
        throw error;
      }
    },
    async entriesAbout(entity) {
      const rows = await deps.db
        .select()
        .from(auditEntry)
        .where(and(eq(auditEntry.entityKind, entity.kind), eq(auditEntry.entityId, entity.id)))
        .orderBy(asc(auditEntry.at), asc(auditEntry.seq));
      return rows.map(toEntry);
    },
    async allEntries() {
      const rows = await deps.db.select().from(auditEntry).orderBy(asc(auditEntry.at), asc(auditEntry.seq));
      return rows.map(toEntry);
    },
    async entriesForLokasi(lokasiId) {
      const rows = await deps.db
        .select()
        .from(auditEntry)
        .where(and(eq(auditEntry.lokasiId, lokasiId), notInArray(auditEntry.action, [...HIDDEN_FROM_ADMIN_LOKASI])))
        .orderBy(asc(auditEntry.at), asc(auditEntry.seq));
      return rows.map(toEntry);
    },
  };
}

function toEntry(row: typeof auditEntry.$inferSelect): AuditEntry {
  return {
    id: row.id,
    at: row.at,
    actor: { accountId: row.actorAccountId, role: row.actorRole as AuditActorRole },
    action: row.action as AuditAction,
    entity: { kind: row.entityKind, id: row.entityId },
    lokasiId: row.lokasiId,
    before: (row.before as AuditSnapshot) ?? null,
    after: (row.after as AuditSnapshot) ?? null,
    reason: row.reason,
  };
}
