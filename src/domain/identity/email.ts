import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog, RecordEntry } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import { akunResource, staffRoles, writeRefusal, type Actor, type WriteRefusal } from "./authorize";
import { verifikasiEmailMessage } from "./email-templates";
import { normaliseEmail } from "./email-address";
import { akunLockKey } from "./lock-key";
import { checkCode, sendEmailCode, type CodeRejection, type LimitRefusal } from "./otp";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identityUser } from "./schema";

/*
 * The Akun's own email and phone number (Akun Saya, and the staff area for an
 * Akun Staf). The email is the Akun's key, its Email Terverifikasi (ADR 0004):
 * it changes only through Verifikasi Email and is never removed. The phone
 * number is a contact the Akun edits freely (validated, never verified). For
 * an Akun Staf each change is a staff write with an Entri Audit; a Pemesan's
 * records none.
 */

export interface EmailDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  audit: AuditLog;
  secret: string;
  /** Reports a code the EmailSender refused; gets no address and no code. */
  reportError: (event: string, error: unknown) => void;
}

export type UpdatePhoneNumberResult = { ok: true; phoneNumber: string } | PhoneNumberRejection | WriteRefusal;

/**
 * Akun Saya: the Akun records a new phone number as its contact (+62,
 * normalised). It is never verified and never logs anyone in; it can be
 * changed but not removed.
 */
export async function updatePhoneNumber(
  deps: { db: Database; clock: Clock; audit: AuditLog },
  by: Actor,
  input: { phoneNumber: string },
): Promise<UpdatePhoneNumberResult> {
  const refusal = writeRefusal(by, "akun.telepon", akunResource(by.accountId));
  if (refusal) return refusal;
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;
  const now = deps.clock.now();

  const write = async (tx: Database) => {
    const [row] = await tx
      .select({ phoneNumber: identityUser.phoneNumber })
      .from(identityUser)
      .where(eq(identityUser.id, by.accountId))
      .for("update");
    await tx.update(identityUser).set({ phoneNumber, updatedAt: now }).where(eq(identityUser.id, by.accountId));
    return row?.phoneNumber ?? null;
  };
  const staffRole = staffRoles.find((role) => by.roles.includes(role));
  if (!staffRole) {
    await deps.db.transaction(write);
    return { ok: true, phoneNumber };
  }
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await write(tx);
    await record({
      actor: { accountId: by.accountId, role: staffRole },
      action: "akun.ubah_telepon",
      entity: { kind: "akun", id: by.accountId },
      before: { phoneNumber: before },
      after: { phoneNumber },
      reason: null,
    });
    return { ok: true, phoneNumber } as const;
  });
}

export type RequestEmailVerificationResult =
  | { ok: true; email: string; sentAt: Date; expiresAt: Date; resendAt: Date }
  | { ok: false; reason: "email_tidak_valid" | "gagal_kirim" }
  | LimitRefusal
  | WriteRefusal;

/**
 * Verifikasi Email, step 1: sends a code to the email typed (the Akun's own, or
 * a new one). Nothing on the Akun changes until the code is entered, so an
 * Email Terverifikasi stays in use until its replacement is proven (decision Q9).
 */
export async function requestEmailVerification(
  deps: EmailDeps,
  by: Actor,
  input: { email: string; ip: string },
): Promise<RequestEmailVerificationResult> {
  const refusal = writeRefusal(by, "akun.email", akunResource(by.accountId));
  if (refusal) return refusal;
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const sent = await sendEmailCode(deps, {
    ip: input.ip,
    request: { target: email, purpose: "verifikasi_email", lockKey: akunLockKey(by.accountId) },
    deliver: (code) => deps.email.send({ to: email, ...verifikasiEmailMessage(code) }),
    failureEvent: "kode Verifikasi Email tidak terkirim",
  });
  if (!sent.ok) return sent;
  return { ok: true, email, sentAt: sent.sentAt, expiresAt: sent.expiresAt, resendAt: sent.resendAt };
}

export type ConfirmEmailVerificationResult =
  | { ok: true; email: string }
  | CodeRejection
  /** Another Akun already has this Email Terverifikasi; Admin Platform resolves it through CS. */
  | { ok: false; reason: "email_sudah_dipakai" }
  | WriteRefusal;

/**
 * Verifikasi Email, step 2: the code sent in step 1 makes its email the Akun's
 * Email Terverifikasi (replacing any earlier email). Refused, with nothing
 * changed, when another Akun already has that Email Terverifikasi.
 */
export async function confirmEmailVerification(
  deps: EmailDeps,
  by: Actor,
  input: { code: string },
): Promise<ConfirmEmailVerificationResult> {
  const refusal = writeRefusal(by, "akun.email", akunResource(by.accountId));
  if (refusal) return refusal;
  const lockKey = akunLockKey(by.accountId);
  const checked = await checkCode(deps, { lookup: { purpose: "verifikasi_email", lockKey }, code: input.code });
  if (!checked.ok) return checked;
  const email = checked.target;

  try {
    await markVerified(deps, by, email);
    return { ok: true, email };
  } catch (error) {
    // The database's unique index is the one rule: another Akun has this Email Terverifikasi
    // (already, or it won a race), so this transaction rolled back and nothing changed.
    if (isVerifiedEmailTaken(error)) return { ok: false, reason: "email_sudah_dipakai" };
    throw error;
  }
}

/**
 * Makes `email` the Akun's Email Terverifikasi in one transaction. For an Akun
 * Staf it is a staff write: `audit.staffWrite` records `akun.email_verifikasi`
 * with the email before and after (never a code), under the first staff role
 * the Akun holds.
 */
async function markVerified(deps: EmailDeps, by: Actor, email: string): Promise<void> {
  const now = deps.clock.now();
  const write = async (tx: Database) => {
    const [row] = await tx
      .select({ email: identityUser.contactEmail, verifiedAt: identityUser.emailVerifiedAt })
      .from(identityUser)
      .where(eq(identityUser.id, by.accountId))
      .for("update");
    await tx
      .update(identityUser)
      .set({ contactEmail: email, emailVerifiedAt: now, updatedAt: now })
      .where(eq(identityUser.id, by.accountId));
    return { email: row?.email ?? null, terverifikasi: Boolean(row?.email && row.verifiedAt) };
  };

  const staffRole = staffRoles.find((role) => by.roles.includes(role));
  if (!staffRole) {
    await deps.db.transaction(write);
    return;
  }
  await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await write(tx);
    await record({
      actor: { accountId: by.accountId, role: staffRole },
      action: "akun.email_verifikasi",
      entity: { kind: "akun", id: by.accountId },
      before,
      after: { email, terverifikasi: true },
      reason: null,
    });
    return { ok: true } as const;
  });
}

/**
 * Runs a staff write that may mark an Email Terverifikasi: when the database's
 * unique index refuses it (another Akun has that Email Terverifikasi, already
 * or by winning a race), the transaction has rolled back and this is the refusal.
 */
export async function verifiedEmailTakenAsRefusal<T>(
  write: () => Promise<T>,
): Promise<T | { ok: false; reason: "email_sudah_dipakai" }> {
  try {
    return await write();
  } catch (error) {
    if (isVerifiedEmailTaken(error)) return { ok: false, reason: "email_sudah_dipakai" };
    throw error;
  }
}

/**
 * Inside a staff write, with the Akun's row already locked by the caller: makes
 * the Akun's email on record (`email`, normalised) its Email Terverifikasi and
 * records `akun.email_verifikasi` by `ops_cli` (before/after `terverifikasi`,
 * the reason; never a code). The caller has checked the email is not yet
 * verified. Used only by `verify-email`.
 */
export async function markEmailOnRecordVerified(
  tx: Database,
  record: RecordEntry,
  clock: Clock,
  input: { accountId: string; email: string; reason: string },
): Promise<void> {
  const now = clock.now();
  await tx
    .update(identityUser)
    .set({ contactEmail: input.email, emailVerifiedAt: now, updatedAt: now })
    .where(eq(identityUser.id, input.accountId));
  await record({
    // No one is signed in: the entry names the Akun, acting as the CLI.
    actor: { accountId: input.accountId, role: "ops_cli" },
    action: "akun.email_verifikasi",
    entity: { kind: "akun", id: input.accountId },
    before: { email: input.email, terverifikasi: false },
    after: { email: input.email, terverifikasi: true },
    reason: input.reason,
  });
}

/** True for the unique violation of identity_user_verified_email_idx (a verified email belongs to one Akun). */
function isVerifiedEmailTaken(error: unknown): boolean {
  let current: unknown = error;
  while (typeof current === "object" && current !== null) {
    const { code, constraint, cause } = current as { code?: string; constraint?: string; cause?: unknown };
    if (code === "23505" && constraint === "identity_user_verified_email_idx") return true;
    current = cause;
  }
  return false;
}
