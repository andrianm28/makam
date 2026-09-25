import { and, eq, isNotNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { EmailSender } from "@/ports/email-sender";
import { kodeMasukEmailMessage } from "./email-templates";
import { logInAkun, type LoginDeps, type VerifyOtpResult } from "./login";
import { akunLockKey, issueCode, OTP_RESEND_AFTER_MS } from "./otp";
import { identityUser } from "./schema";
import { normaliseEmail } from "./staff";

export interface EmailLoginDeps extends LoginDeps {
  email: EmailSender;
}

/**
 * The one reply to the email step of Masuk dengan email, whatever the email
 * (the screen says "Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim.").
 */
export type RequestEmailLoginResult =
  | { ok: true; email: string; resendAt: Date }
  | { ok: false; reason: "email_tidak_valid" };

/**
 * Masuk dengan email, step 1: sends a Kode Masuk when the email is the Email
 * Terverifikasi of an Akun. The reply is the same for every email.
 */
export async function requestEmailLogin(
  deps: EmailLoginDeps,
  input: { email: string; ip: string },
): Promise<RequestEmailLoginResult> {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const now = deps.clock.now();

  const akun = await akunOfVerifiedEmail(deps.db, email);
  if (akun) {
    await issueCode(
      deps,
      { channel: "email", target: email, purpose: "masuk", lockKey: akunLockKey(akun.id) },
      (code) => deps.email.send({ to: email, ...kodeMasukEmailMessage(code) }),
    );
  }
  return { ok: true, email, resendAt: new Date(now.getTime() + OTP_RESEND_AFTER_MS) };
}

/**
 * Masuk dengan email, step 2: the Kode Masuk logs into the Akun whose Email
 * Terverifikasi it was sent to. Never creates an Akun.
 */
export async function verifyEmailLogin(
  deps: EmailLoginDeps,
  input: { email: string; code: string },
): Promise<VerifyOtpResult> {
  const email = normaliseEmail(input.email);
  const akun = email ? await akunOfVerifiedEmail(deps.db, email) : null;
  if (!email || !akun) return { ok: false, reason: "kode_salah" };
  return logInAkun(deps, {
    phoneNumber: akun.phoneNumber,
    lookup: { channel: "email", target: email, purpose: "masuk" },
    lockKey: akunLockKey(akun.id),
    code: input.code,
    mayCreate: false,
  });
}

/** The Akun whose Email Terverifikasi this (normalised) email is, or null. */
async function akunOfVerifiedEmail(db: Database, email: string) {
  const [row] = await db
    .select({ id: identityUser.id, phoneNumber: identityUser.phoneNumber })
    .from(identityUser)
    .where(and(eq(identityUser.contactEmail, email), isNotNull(identityUser.emailVerifiedAt)));
  return row?.phoneNumber ? { id: row.id, phoneNumber: row.phoneNumber } : null;
}
