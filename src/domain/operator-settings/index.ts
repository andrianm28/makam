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
  normalisePhoneNumber,
  pengaturanOperatorResource,
  writeRefusal,
  type Actor,
  type PhoneNumberRejection,
  type WriteRefusal,
} from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { operatorSettingsVersion } from "./schema";

/**
 * The six values of Pengaturan Operator, all required:
 * - `legalName`: the Operator's legal name, e.g. "PT Jaya Korpora Prima" (document headers, footer, Hubungi Kami);
 * - `address`: registered address, free text, may span lines (document headers, Hubungi Kami);
 * - `phone`: the Operator's contact phone as typed (may be a landline), trimmed;
 * - `email`: the Operator's contact email, trimmed and lower-cased;
 * - `csWhatsApp`: the CS WhatsApp number, canonical E.164 +62 (e.g. "+6281122223333"); build wa.me links from it;
 * - `csReplyHours`: when CS replies, as shown next to the number, e.g. "dibalas mulai pukul 06:00".
 */
export const operatorSettingsFields = ["legalName", "address", "phone", "email", "csWhatsApp", "csReplyHours"] as const;
export type OperatorSettingsField = (typeof operatorSettingsFields)[number];

/** One value per field of Pengaturan Operator (see `operatorSettingsFields`). */
export type OperatorSettingsEntry = Record<OperatorSettingsField, string>;

/** Pengaturan Operator as in force from `inForceFrom` until the next change. */
export interface OperatorSettingsValues extends OperatorSettingsEntry {
  /** The Clock instant this version came into force. */
  inForceFrom: Date;
}

/** Every value at once (as typed), plus an optional reason for the Entri Audit. */
export interface ChangeOperatorSettingsInput extends OperatorSettingsEntry {
  reason: string | null;
}

/** The Audit Log entity every change of Pengaturan Operator is recorded on: `{ kind: "pengaturan_operator", id }`. */
export const OPERATOR_SETTINGS_ENTITY_ID = "operator";

export type ChangeOperatorSettingsResult =
  | { ok: true; settings: OperatorSettingsValues }
  | WriteRefusal
  | { ok: false; reason: "email_tidak_valid" }
  | { ok: false; reason: "isian_wajib"; field: OperatorSettingsField }
  | PhoneNumberRejection;

export interface OperatorSettings {
  /**
   * The values in force now, or null before an Admin Platform first enters them
   * (nothing is seeded). A Tagihan or Bukti reads this inside its issuing
   * transaction and copies the header values onto its own row.
   */
  current(): Promise<OperatorSettingsValues | null>;
  /**
   * The values in force at `instant`: the last change made at or before it, or
   * null when none was. For lookup and audit (what was in force then); an
   * issued document renders its header from its own copy, not from this.
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
      const refusal = writeRefusal(by, "pengaturan_operator.ubah", pengaturanOperatorResource());
      if (refusal) return refusal;
      const checked = checkValues(input);
      if (!checked.ok) return checked;
      return deps.audit.staffWrite(deps.db, async (tx, record) => {
        // One change at a time, so each Entri Audit's "before" is the version it replaced.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('operator_settings.change'))`);
        const previous = await latest(tx);
        const [row] = await tx
          .insert(operatorSettingsVersion)
          .values({ ...checked.values, inForceFrom: deps.clock.now(), changedByAccountId: by.accountId })
          .returning();
        const settings = toValues(row);
        await record({
          actor: { accountId: by.accountId, role: "admin_platform" },
          action: "pengaturan_operator.ubah",
          entity: { kind: "pengaturan_operator", id: OPERATOR_SETTINGS_ENTITY_ID },
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
): { ok: true; values: OperatorSettingsEntry } | Exclude<ChangeOperatorSettingsResult, { ok: true }> {
  const trimmed = entryOf(input, (value) => value.trim());
  for (const field of operatorSettingsFields) {
    if (trimmed[field] === "") return { ok: false, reason: "isian_wajib", field };
  }
  const email = trimmed.email.toLowerCase();
  if (!emailSchema.safeParse(email).success) return { ok: false, reason: "email_tidak_valid" };
  const csWhatsApp = normalisePhoneNumber(trimmed.csWhatsApp);
  if (!csWhatsApp.ok) return csWhatsApp;
  return { ok: true, values: { ...trimmed, email, csWhatsApp: csWhatsApp.phoneNumber } };
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
  return entryOf(settings);
}

function toValues(row: typeof operatorSettingsVersion.$inferSelect): OperatorSettingsValues {
  return { ...entryOf(row), inForceFrom: row.inForceFrom };
}

/** Just the six values of `source`, each passed through `map`. */
function entryOf(source: OperatorSettingsEntry, map: (value: string) => string = (value) => value): OperatorSettingsEntry {
  return Object.fromEntries(operatorSettingsFields.map((field) => [field, map(source[field])])) as OperatorSettingsEntry;
}
