"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  otpMessage,
  type OtpRequestState,
  type OtpVerifyState,
} from "@/components/otp/state";
import { serverRuntime } from "@/server/runtime";
import { setSessionCookies } from "@/server/session";

/*
 * Masuk is how a caller becomes authenticated, so these two actions have no
 * actor to check: they validate with Zod and call the identity module, which
 * enforces every OTP rule.
 */

const requestSchema = z.object({ phoneNumber: z.string().trim().min(1).max(32) });
const verifySchema = z.object({
  phoneNumber: z.string().trim().min(1).max(32),
  code: z.string().trim().regex(/^\d{6}$/),
});

/** Sends (or re-sends) the WhatsApp OTP. */
export async function kirimOtp(_previous: OtpRequestState, formData: FormData): Promise<OtpRequestState> {
  const parsed = requestSchema.safeParse({ phoneNumber: formData.get("phoneNumber") });
  if (!parsed.success) return { status: "gagal", message: otpMessage("nomor_tidak_valid") };

  const { identity, adapters } = serverRuntime();
  const result = await identity.requestOtp(parsed.data);
  const now = adapters.clock.now();
  if (!result.ok) {
    const retryAt = "retryAt" in result ? result.retryAt : undefined;
    return { status: "gagal", message: otpMessage(result.reason, retryAt, now), phoneNumber: parsed.data.phoneNumber };
  }
  return {
    status: "terkirim",
    phoneNumber: result.phoneNumber,
    resendInSeconds: secondsUntil(result.resendAt, now),
    fallbackInSeconds: secondsUntil(result.fallbackAt, now),
    sentAt: result.sentAt.toISOString(),
  };
}

/** Checks the OTP; on success stores the session and lands on Akun Saya. */
export async function masukDenganOtp(_previous: OtpVerifyState, formData: FormData): Promise<OtpVerifyState> {
  const parsed = verifySchema.safeParse({ phoneNumber: formData.get("phoneNumber"), code: formData.get("code") });
  if (!parsed.success) return { status: "gagal", message: "Masukkan 6 angka kode dari WhatsApp." };

  const { identity, adapters } = serverRuntime();
  const result = await identity.verifyOtp(parsed.data);
  if (!result.ok) {
    const retryAt = "retryAt" in result ? result.retryAt : undefined;
    return { status: "gagal", message: otpMessage(result.reason, retryAt, adapters.clock.now()) };
  }
  await setSessionCookies(result.session.cookies);
  redirect("/akun");
}

function secondsUntil(at: Date, now: Date): number {
  return Math.max(0, Math.ceil((at.getTime() - now.getTime()) / 1000));
}
