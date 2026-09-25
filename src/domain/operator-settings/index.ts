/**
 * Pengaturan Operator (spec, domain module 17): the Operator's own reference
 * values that no other screen owns. Every consumer (document headers, the CS
 * button, Hubungi Kami, the inbound auto-reply, the OTP no-fallback pointer,
 * the night TPU submission text) reads them here, never from env or constants.
 *
 * Owns table: operator_settings_version (append-only: the database refuses
 * UPDATE and DELETE). Each change is a full new version stamped with the Clock.
 *
 * Every change records an Entri Audit through the Audit Log, in the same transaction.
 */
import { desc, lte, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog, AuditSnapshot } from "@/domain/audit";
import {
  authorize,
  normalisePhoneNumber,
  pengaturanOperatorResource,
  type Actor,
  type PhoneNumberRejection,
} from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { operatorSettingsVersion } from "./schema";

/** Pengaturan Operator as in force from `inForceFrom` until the next change. */
export interface OperatorSettingsValues {
  /** The Operator's legal name, e.g. "PT Jaya Korpora Prima" (document headers, footer, Hubungi Kami). */
  legalName: string;
  /** Registered address, free text, may span lines (document headers, Hubungi Kami). */
  address: string;
  /** The Operator's contact phone as typed (may be a landline), trimmed. */
  phone: string;
  /** The Operator's contact email, trimmed and lower-cased. */
  email: string;
  /** The CS WhatsApp number, canonical E.164 +62 (e.g. "+6281122223333"); build wa.me links from it. */
  csWhatsApp: string;
  /** When CS replies, as shown next to the number, e.g. "dibalas mulai pukul 06:00". */
  csReplyHours: string;
  /** The Clock instant this version came into force. */
  inForceFrom: Date;
}

export interface ChangeOperatorSettingsInput {
  legalName: string;
  address: string;
  phone: string;
  email: string;
  csWhatsApp: string;
  csReplyHours: string;
  reason: string | null;
}

/** The free-text values that must not be blank. */
type RequiredField = "legalName" | "address" | "phone" | "csReplyHours";

export type ChangeOperatorSettingsResult =
  | { ok: true; settings: OperatorSettingsValues }
  | { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "email_tidak_valid" }
  | { ok: false; reason: "isian_wajib"; field: RequiredField }
  | PhoneNumberRejection;

export interface OperatorSettings {
  /** The values in force now, or null before an Admin Platform first enters them (nothing is seeded). */
  current(): Promise<OperatorSettingsValues | null>;
  /**
   * The values in force at `instant`: the last change made at or before it, or
   * null when none was. An issued Tagihan or Bukti reads its header with its
   * issue time, so a later change never alters it.
   */
  inForceAt(instant: Date): Promise<OperatorSettingsValues | null>;
  /** Admin Platform (past TOTP) saves all the values as a new version in force from now; audited with before/after. */
  change(by: Actor, input: ChangeOperatorSettingsInput): Promise<ChangeOperatorSettingsResult>;
}

export function createOperatorSettings(deps: { db: Database; clock: Clock; audit: AuditLog }): OperatorSettings {
  return {
    current: () => latest(deps.db),
    inForceAt: (instant) => latest(deps.db, lte(operatorSettingsVersion.inForceFrom, instant)),
    async change(by, input) {
      // Defence in depth behind guarded(): the module checks the actor itself.
      const authorization = authorize(by, "pengaturan_operator.ubah", pengaturanOperatorResource());
      if (!authorization.allowed) {
        return { ok: false, reason: authorization.reason === "perlu_totp" ? "perlu_totp" : "tidak_berwenang" };
      }
      const checked = checkValues(input);
      if (!checked.ok) return checked;
      return deps.audit.staffWrite(deps.db, async (tx, record) => {
        // One change at a time, so each Entri Audit's "before" is the version it replaced.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('operator_settings_version'))`);
        const previous = await latest(tx);
        const [row] = await tx
          .insert(operatorSettingsVersion)
          .values({ ...checked.values, inForceFrom: deps.clock.now(), changedByAccountId: by.accountId })
          .returning();
        const settings = toValues(row);
        await record({
          actor: { accountId: by.accountId, role: "admin_platform" },
          action: "pengaturan_operator.ubah",
          entity: { kind: "pengaturan_operator", id: "operator" },
          before: previous && auditSnapshot(previous),
          after: auditSnapshot(settings),
          reason: input.reason?.trim() || null,
        });
        return { ok: true as const, settings };
      });
    },
  };
}

const emailSchema = z.email();

/** The values as kept (trimmed; email lower-cased; CS WhatsApp in +62 form), or why they are refused. */
function checkValues(
  input: ChangeOperatorSettingsInput,
): { ok: true; values: Omit<OperatorSettingsValues, "inForceFrom"> } | Exclude<ChangeOperatorSettingsResult, { ok: true }> {
  const text = {
    legalName: input.legalName.trim(),
    address: input.address.trim(),
    phone: input.phone.trim(),
    csReplyHours: input.csReplyHours.trim(),
  };
  for (const field of ["legalName", "address", "phone", "csReplyHours"] as const) {
    if (text[field] === "") return { ok: false, reason: "isian_wajib", field };
  }
  const email = input.email.trim().toLowerCase();
  if (!emailSchema.safeParse(email).success) return { ok: false, reason: "email_tidak_valid" };
  const csWhatsApp = normalisePhoneNumber(input.csWhatsApp);
  if (!csWhatsApp.ok) return csWhatsApp;
  return { ok: true, values: { ...text, email, csWhatsApp: csWhatsApp.phoneNumber } };
}

/** The last change (optionally among those matching `where`), or null when there is none. */
async function latest(db: Database, where?: SQL): Promise<OperatorSettingsValues | null> {
  const [row] = await db
    .select()
    .from(operatorSettingsVersion)
    .where(where)
    .orderBy(desc(operatorSettingsVersion.inForceFrom), desc(operatorSettingsVersion.seq))
    .limit(1);
  return row ? toValues(row) : null;
}

/** The values as an Entri Audit keeps them; the entry's own time is when they came into force. */
function auditSnapshot(settings: OperatorSettingsValues): AuditSnapshot {
  const { legalName, address, phone, email, csWhatsApp, csReplyHours } = settings;
  return { legalName, address, phone, email, csWhatsApp, csReplyHours };
}

function toValues(row: typeof operatorSettingsVersion.$inferSelect): OperatorSettingsValues {
  return {
    legalName: row.legalName,
    address: row.address,
    phone: row.phone,
    email: row.email,
    csWhatsApp: row.csWhatsApp,
    csReplyHours: row.csReplyHours,
    inForceFrom: row.inForceFrom,
  };
}
