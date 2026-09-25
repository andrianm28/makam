import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import type { Actor } from "./authorize";
import { verifikasiEmailMessage } from "./email-templates";
import { akunLockKey, checkCode, issueCode, type CodeRejection, type LimitRefusal } from "./otp";
import { identityUser } from "./schema";
import { normaliseEmail } from "./staff";

export interface EmailDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  audit: AuditLog;
  secret: string;
}

/** The Akun's email as Akun Saya and the staff area show it. */
export interface AccountEmail {
  email: string | null;
  /** True when `email` is the Akun's Email Terverifikasi. */
  verified: boolean;
}

export async function accountEmail(deps: { db: Database }, by: Actor): Promise<AccountEmail> {
  const [row] = await deps.db
    .select({ email: identityUser.contactEmail, verifiedAt: identityUser.emailVerifiedAt })
    .from(identityUser)
    .where(eq(identityUser.id, by.accountId));
  return { email: row?.email ?? null, verified: Boolean(row?.email && row.verifiedAt) };
}

export type SaveEmailResult = { ok: true; email: string } | { ok: false; reason: "email_tidak_valid" };

/** The profile's email field: stores the typed email on the Akun, unverified. */
export async function saveEmail(deps: EmailDeps, by: Actor, input: { email: string }): Promise<SaveEmailResult> {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const now = deps.clock.now();
  await deps.db.update(identityUser).set({ contactEmail: email, updatedAt: now }).where(eq(identityUser.id, by.accountId));
  return { ok: true, email };
}

export type RequestEmailVerificationResult =
  | { ok: true; email: string; sentAt: Date; expiresAt: Date; resendAt: Date }
  | { ok: false; reason: "email_tidak_valid" | "gagal_kirim" }
  | LimitRefusal;

/**
 * Verifikasi Email, step 1: sends a code to the email typed (the Akun's own, or
 * a new one). Nothing on the Akun changes until the code is entered.
 */
export async function requestEmailVerification(
  deps: EmailDeps,
  by: Actor,
  input: { email: string; ip: string },
): Promise<RequestEmailVerificationResult> {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };

  const issued = await issueCode(
    deps,
    { channel: "email", target: email, purpose: "verifikasi_email", lockKey: akunLockKey(by.accountId) },
    (code) => deps.email.send({ to: email, ...verifikasiEmailMessage(code) }),
  );
  if (!issued.ok) return issued.reason === "gagal_kirim" ? { ok: false, reason: "gagal_kirim" } : issued;
  return { ok: true, email, sentAt: issued.sentAt, expiresAt: issued.expiresAt, resendAt: issued.resendAt };
}

export type ConfirmEmailVerificationResult = { ok: true; email: string } | CodeRejection;

/**
 * Verifikasi Email, step 2: the code sent in step 1 makes its email the Akun's
 * Email Terverifikasi (replacing any earlier email).
 */
export async function confirmEmailVerification(
  deps: EmailDeps,
  by: Actor,
  input: { code: string },
): Promise<ConfirmEmailVerificationResult> {
  const lockKey = akunLockKey(by.accountId);
  const checked = await checkCode(deps, { lookup: { purpose: "verifikasi_email", lockKey }, lockKey, code: input.code });
  if (!checked.ok) return checked;
  const email = checked.target;
  const now = deps.clock.now();
  await deps.db
    .update(identityUser)
    .set({ contactEmail: email, emailVerifiedAt: now, updatedAt: now })
    .where(eq(identityUser.id, by.accountId));
  return { ok: true, email };
}
