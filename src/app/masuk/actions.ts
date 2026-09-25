"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { EMAIL_LOGIN_REPLY, type EmailRequestState } from "@/components/email/state";
import {
  otpMessage,
  type OtpRefusal,
  type OtpRequestState,
  type OtpVerifyState,
} from "@/components/otp/state";
import type { Role } from "@/domain/identity";
import { clientIp } from "@/server/client-ip";
import { phoneNumberInput } from "@/server/phone-number-input";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";

/*
 * Masuk is how a caller becomes authenticated, so these actions skip the
 * guard's authenticate and role steps (the one exception, noted in AGENTS.md):
 * they validate with Zod and call the identity module, which enforces every
 * Kode Masuk rule.
 */

const codeInput = z.string().trim().regex(/^\d{6}$/);
const emailInput = z.string().trim().min(3).max(254);

const requestSchema = z.object({ phoneNumber: phoneNumberInput });
const verifySchema = z.object({
  phoneNumber: phoneNumberInput,
  code: codeInput,
  channel: z.enum(["whatsapp", "email"]).default("whatsapp"),
});
const emailRequestSchema = z.object({ email: emailInput });
const emailVerifySchema = z.object({ email: emailInput, code: codeInput });

/** Sends (or re-sends) the WhatsApp Kode Masuk. */
export async function kirimOtp(_previous: OtpRequestState, formData: FormData): Promise<OtpRequestState> {
  const parsed = requestSchema.safeParse({ phoneNumber: formData.get("phoneNumber") });
  if (!parsed.success) return { status: "gagal", message: otpMessage("nomor_tidak_valid") };

  const { identity, adapters } = serverRuntime();
  const result = await identity.requestOtp(parsed.data);
  const now = adapters.clock.now();
  if (!result.ok) {
    return { status: "gagal", message: refusalMessage(result, now), phoneNumber: parsed.data.phoneNumber };
  }
  return {
    status: "terkirim",
    phoneNumber: result.phoneNumber,
    resendInSeconds: secondsUntil(result.resendAt, now),
    fallbackInSeconds: secondsUntil(result.fallbackAt, now),
    emailFallback: result.emailFallback,
    sentAt: result.sentAt.toISOString(),
  };
}

/**
 * Checks the Kode Masuk typed on the WhatsApp code screen (`channel: "email"`
 * for the one "Kirim lewat email" sent); on success stores the session and
 * lands on Akun Saya, or the staff area for staff.
 */
export async function masukDenganOtp(_previous: OtpVerifyState, formData: FormData): Promise<OtpVerifyState> {
  const parsed = verifySchema.safeParse({
    phoneNumber: formData.get("phoneNumber"),
    code: formData.get("code"),
    channel: formData.get("channel") ?? undefined,
  });
  if (!parsed.success) return { status: "gagal", message: "Masukkan 6 angka kode Anda." };

  const { identity, adapters } = serverRuntime();
  const result = await identity.verifyOtp(parsed.data);
  if (!result.ok) return { status: "gagal", message: refusalMessage(result, adapters.clock.now()) };
  await setSessionCookies(result.session.cookies);
  redirect(landingFor(result.roles));
}

/** Masuk dengan email, step 1: the same reply for every email (story 189). */
export async function kirimKodeEmail(_previous: EmailRequestState, formData: FormData): Promise<EmailRequestState> {
  const parsed = emailRequestSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { status: "gagal", message: otpMessage("email_tidak_valid") };

  const { identity, adapters } = serverRuntime();
  const result = await identity.requestEmailLogin({ email: parsed.data.email, ip: await clientIp() });
  const now = adapters.clock.now();
  if (!result.ok) return { status: "gagal", message: refusalMessage(result, now), email: parsed.data.email };
  return {
    status: "terkirim",
    email: result.email,
    message: EMAIL_LOGIN_REPLY,
    resendInSeconds: secondsUntil(result.resendAt, now),
    sentAt: now.toISOString(),
  };
}

/** Masuk dengan email, step 2: the Kode Masuk from the email. */
export async function masukDenganEmail(_previous: OtpVerifyState, formData: FormData): Promise<OtpVerifyState> {
  const parsed = emailVerifySchema.safeParse({ email: formData.get("email"), code: formData.get("code") });
  if (!parsed.success) return { status: "gagal", message: "Masukkan 6 angka kode dari email." };

  const { identity, adapters } = serverRuntime();
  const result = await identity.verifyEmailLogin(parsed.data);
  if (!result.ok) return { status: "gagal", message: refusalMessage(result, adapters.clock.now()) };
  await setSessionCookies(result.session.cookies);
  redirect(landingFor(result.roles));
}

/** "Kirim lewat email" on the WhatsApp code screen. */
export async function kirimKodeLewatEmail(_previous: OtpVerifyState, formData: FormData): Promise<OtpVerifyState | { status: "terkirim" }> {
  const parsed = requestSchema.safeParse({ phoneNumber: formData.get("phoneNumber") });
  if (!parsed.success) return { status: "gagal", message: otpMessage("nomor_tidak_valid") };

  const { identity, adapters } = serverRuntime();
  const result = await identity.requestEmailFallback({ phoneNumber: parsed.data.phoneNumber, ip: await clientIp() });
  if (result.ok) return { status: "terkirim" };
  if (result.reason === "gagal_kirim") return { status: "gagal", message: "Kode belum bisa dikirim lewat email. Silakan coba lagi." };
  return { status: "gagal", message: refusalMessage(result, adapters.clock.now()) };
}

/** Staff go to the staff area (which holds an Admin Platform at the TOTP step first); a Pemesan to Akun Saya. */
function landingFor(roles: Role[]): string {
  return roles.some((role) => role !== "pemesan") ? "/staf" : "/akun";
}

/** The message for an identity refusal, with its wait time when it has one. */
function refusalMessage(refusal: { reason: OtpRefusal; retryAt?: Date }, now: Date): string {
  return otpMessage(refusal.reason, refusal.retryAt, now);
}

function secondsUntil(at: Date, now: Date): number {
  return Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 1000));
}
