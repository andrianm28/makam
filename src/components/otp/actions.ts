"use server";

import { z } from "zod";
import { clientIp } from "@/server/client-ip";
import { phoneNumberInput } from "@/server/phone-number-input";
import { serverRuntime } from "@/server/runtime";
import { otpMessage, type EmailFallbackState } from "./state";

/*
 * "Kirim lewat email" in the OTP screen's fallback slot. Part of the login,
 * like the Masuk actions (AGENTS.md exception: no authenticate or role step):
 * validated with Zod, then the identity module. Lives with the component so
 * every screen that embeds OtpVerification (Masuk, Kirim in the wizards) has it.
 */

const schema = z.object({ phoneNumber: phoneNumberInput });

export async function kirimKodeLewatEmail(_previous: EmailFallbackState, formData: FormData): Promise<EmailFallbackState> {
  const parsed = schema.safeParse({ phoneNumber: formData.get("phoneNumber") });
  if (!parsed.success) return { status: "gagal", message: otpMessage("nomor_tidak_valid") };

  const { identity, adapters } = serverRuntime();
  const result = await identity.requestEmailFallback({ phoneNumber: parsed.data.phoneNumber, ip: await clientIp() });
  if (result.ok) return { status: "terkirim", sentAt: result.sentAt.toISOString() };
  if (result.reason === "gagal_kirim") {
    return { status: "gagal", message: "Kode belum bisa dikirim lewat email. Silakan coba lagi." };
  }
  return {
    status: "gagal",
    message: otpMessage(result.reason, "retryAt" in result ? result.retryAt : undefined, adapters.clock.now()),
  };
}
