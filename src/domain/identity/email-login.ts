import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { EmailSender } from "@/ports/email-sender";
import { kodeMasukEmailMessage } from "./email-templates";
import { logInAkun, type LoginDeps, type VerifyOtpResult } from "./login";
import {
  akunLockKey,
  akunOfNumber,
  claimIpRequest,
  issueCode,
  lastSentAt,
  OTP_FALLBACK_AFTER_MS,
  OTP_RESEND_AFTER_MS,
  type LimitRefusal,
} from "./otp";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identityUser } from "./schema";
import { normaliseEmail } from "./staff";

export interface EmailLoginDeps extends LoginDeps {
  email: EmailSender;
  reportError: (event: string, error: unknown) => void;
}

/**
 * The one reply to the email step of Masuk dengan email, whatever the email
 * (the screen says "Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim.").
 */
export type RequestEmailLoginResult =
  | { ok: true; email: string; resendAt: Date }
  | { ok: false; reason: "email_tidak_valid" }
  /** The IP's own limits: they depend only on the IP, never on the email typed. */
  | LimitRefusal;

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
  const ip = await claimIpRequest(deps, input.ip);
  if (!ip.ok) return ip;

  const akun = await akunOfVerifiedEmail(deps.db, email);
  if (akun) {
    const issued = await issueCode(
      deps,
      { channel: "email", target: email, purpose: "masuk", lockKey: akunLockKey(akun.id) },
      (code) => deps.email.send({ to: email, ...kodeMasukEmailMessage(code) }),
    );
    // Not counted against the limits (issueCode), and not shown: saying "gagal kirim" here would tell
    // anyone that this email is an Email Terverifikasi.
    if (!issued.ok && issued.reason === "gagal_kirim") deps.reportError("email Kode Masuk tidak terkirim", issued.error);
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

export type RequestEmailFallbackResult =
  | { ok: true; sentAt: Date; resendAt: Date }
  | PhoneNumberRejection
  /** The number has no Akun, or its Akun no Email Terverifikasi: the screen points to CS instead. */
  | { ok: false; reason: "tanpa_email_terverifikasi" | "gagal_kirim" }
  | LimitRefusal;

/**
 * "Kirim lewat email" on the WhatsApp code screen: from 60 s after the last
 * WhatsApp Kode Masuk, sends the email Kode Masuk to the Email Terverifikasi
 * of the number's existing Akun. The code is then entered on the same screen
 * (verifyOtp with channel "email").
 */
export async function requestEmailFallback(
  deps: EmailLoginDeps,
  input: { phoneNumber: string; ip: string },
): Promise<RequestEmailFallbackResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const akun = await akunOfNumber(deps.db, normalised.phoneNumber);
  if (!akun?.verifiedEmail) return { ok: false, reason: "tanpa_email_terverifikasi" };
  const email = akun.verifiedEmail;

  const whatsappSentAt = await lastSentAt(deps.db, {
    channel: "whatsapp",
    target: normalised.phoneNumber,
    purpose: "masuk",
  });
  const now = deps.clock.now();
  if (whatsappSentAt) {
    const retryAt = new Date(whatsappSentAt.getTime() + OTP_FALLBACK_AFTER_MS);
    if (now.getTime() < retryAt.getTime()) return { ok: false, reason: "tunggu_kirim_ulang", retryAt };
  }
  const ip = await claimIpRequest(deps, input.ip);
  if (!ip.ok) return ip;

  const issued = await issueCode(
    deps,
    { channel: "email", target: email, purpose: "masuk", lockKey: akunLockKey(akun.id) },
    (code) => deps.email.send({ to: email, ...kodeMasukEmailMessage(code) }),
  );
  if (!issued.ok) {
    if (issued.reason !== "gagal_kirim") return issued;
    deps.reportError("email Kode Masuk tidak terkirim", issued.error);
    return { ok: false, reason: "gagal_kirim" };
  }
  return { ok: true, sentAt: issued.sentAt, resendAt: issued.resendAt };
}

/** The Akun whose Email Terverifikasi this (normalised) email is, or null. */
async function akunOfVerifiedEmail(db: Database, email: string) {
  const [row] = await db
    .select({ id: identityUser.id, phoneNumber: identityUser.phoneNumber })
    .from(identityUser)
    .where(and(eq(sql`lower(${identityUser.contactEmail})`, email), isNotNull(identityUser.emailVerifiedAt)));
  return row?.phoneNumber ? { id: row.id, phoneNumber: row.phoneNumber } : null;
}
