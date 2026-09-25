import type { EmailSender } from "@/ports/email-sender";
import { akunOfNumber, akunOfVerifiedEmail } from "./akun-lookup";
import { kodeMasukEmailMessage } from "./email-templates";
import { akunLockKey } from "./lock-key";
import { akunTheEmailCodeWasSentFor, logInAkun, type LoginDeps, type VerifyOtpResult } from "./login";
import {
  claimIpRequest,
  issueCode,
  lastSentAt,
  OTP_EXPIRES_AFTER_MS,
  OTP_FALLBACK_AFTER_MS,
  OTP_RESEND_AFTER_MS,
  type IssueCodeResult,
  type LimitRefusal,
} from "./otp";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { normaliseEmail } from "./email-address";

export interface EmailLoginDeps extends LoginDeps {
  email: EmailSender;
  reportError: (event: string, error: unknown) => void;
  /** Starts a task the caller does not wait for; the task reports its own failures. */
  runDetached: (task: () => Promise<void>) => void;
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

  // The lookup and the send run detached: the reply waits for neither, so it takes the same time
  // for a verified, unverified, unknown or locked-out email.
  deps.runDetached(async () => {
    try {
      const akun = await akunOfVerifiedEmail(deps.db, email);
      // A failed send is not shown here: saying "gagal kirim" would tell anyone that this email is an
      // Email Terverifikasi.
      if (akun) await sendKodeMasukEmail(deps, akun.id, email);
    } catch (error) {
      deps.reportError("email Kode Masuk tidak terkirim", error);
    }
  });
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
  if (!email) return { ok: false, reason: "kode_salah" };
  return logInAkun(deps, {
    lookup: { channel: "email", target: email, purpose: "masuk" },
    code: input.code,
    signsIn: (checked) => akunTheEmailCodeWasSentFor(deps.db, checked),
  });
}

export type RequestEmailFallbackResult =
  | { ok: true; sentAt: Date; resendAt: Date }
  | PhoneNumberRejection
  /** The number has no Akun, or its Akun no Email Terverifikasi: the screen points to CS instead. */
  | { ok: false; reason: "tanpa_email_terverifikasi" | "gagal_kirim" }
  /** No WhatsApp Kode Masuk went to the number in the last 10 minutes: send one first. */
  | { ok: false; reason: "tanpa_kode_whatsapp" }
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
  // Counted first, before any lookup, so the IP's limits cover every answer below.
  const ip = await claimIpRequest(deps, input.ip);
  if (!ip.ok) return ip;
  const akun = await akunOfNumber(deps.db, normalised.phoneNumber);
  if (!akun?.verifiedEmail) return { ok: false, reason: "tanpa_email_terverifikasi" };
  const email = akun.verifiedEmail;

  // Offered only while a WhatsApp Kode Masuk to this number is still open: from 60 s after it until it expires.
  const now = deps.clock.now();
  const whatsappSentAt = await lastSentAt(
    deps.db,
    { channel: "whatsapp", target: normalised.phoneNumber, purpose: "masuk" },
    new Date(now.getTime() - OTP_EXPIRES_AFTER_MS),
  );
  if (!whatsappSentAt) return { ok: false, reason: "tanpa_kode_whatsapp" };
  const retryAt = new Date(whatsappSentAt.getTime() + OTP_FALLBACK_AFTER_MS);
  if (now.getTime() < retryAt.getTime()) return { ok: false, reason: "tunggu_kirim_ulang", retryAt };

  const issued = await sendKodeMasukEmail(deps, akun.id, email);
  if (!issued.ok) return issued.reason === "gagal_kirim" ? { ok: false, reason: "gagal_kirim" } : issued;
  return { ok: true, sentAt: issued.sentAt, resendAt: issued.resendAt };
}

/**
 * Sends the email Kode Masuk to an Akun's Email Terverifikasi under the shared
 * code rules. A failed send counts against no limit (issueCode) and is
 * reported without the address or the code.
 */
async function sendKodeMasukEmail(deps: EmailLoginDeps, accountId: string, email: string): Promise<IssueCodeResult> {
  const issued = await issueCode(
    deps,
    { channel: "email", target: email, purpose: "masuk", lockKey: akunLockKey(accountId) },
    (code) => deps.email.send({ to: email, ...kodeMasukEmailMessage(code) }),
  );
  if (!issued.ok && issued.reason === "gagal_kirim") deps.reportError("email Kode Masuk tidak terkirim", issued.error);
  return issued;
}
