"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { EMAIL_GAGAL_KIRIM, type EmailProfileState, type EmailRequestState } from "@/components/email/state";
import { identityMessage, type IdentityRefusal } from "@/components/kode-masuk/state";
import { akunResource } from "@/domain/identity";
import { clientIp } from "@/server/client-ip";
import { codeInput, emailInput } from "@/server/code-inputs";
import { guarded, type GuardError } from "@/server/guard";
import { phoneNumberInput } from "@/server/phone-number-input";
import { serverRuntime } from "@/server/runtime";

/*
 * The Akun's own email (its key, changed only by Verifikasi Email) and phone
 * number (a contact), in Akun Saya and in the staff area. Every action goes
 * through the guard (`akun.email` / `akun.telepon` on the actor's own Akun, so
 * an Admin Platform passes TOTP first); the identity module audits the ones an
 * Akun Staf makes.
 */

/** Verifikasi Email, step 1: a code to the typed email; nothing changes until it is entered. */
export async function kirimKodeVerifikasi(_previous: EmailRequestState, formData: FormData): Promise<EmailRequestState> {
  const ip = await clientIp();
  const result = await guarded({
    action: "akun.email",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({ email: emailInput }),
    input: { email: formData.get("email") },
    run: (actor, data) => serverRuntime().identity.requestEmailVerification(actor, { email: data.email, ip }),
  });
  const now = serverRuntime().adapters.clock.now();
  if (!result.ok) return { status: "gagal", message: identityMessage(result.error) };
  const sent = result.value;
  if (!sent.ok) {
    const message =
      sent.reason === "gagal_kirim"
        ? EMAIL_GAGAL_KIRIM
        : identityMessage(sent.reason, "retryAt" in sent ? sent.retryAt : undefined, now);
    return { status: "gagal", message };
  }
  return {
    status: "terkirim",
    email: sent.email,
    message: `Kode verifikasi sudah kami kirim ke ${sent.email}.`,
    resendInSeconds: Math.max(0, Math.ceil((sent.resendAt.getTime() - now.getTime()) / 1000)),
    sentAt: sent.sentAt.toISOString(),
  };
}

/** Verifikasi Email, step 2: the code makes its email the Akun's Email Terverifikasi. */
export async function konfirmasiVerifikasi(_previous: EmailProfileState, formData: FormData): Promise<EmailProfileState> {
  const result = await guarded({
    action: "akun.email",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({ code: codeInput }),
    input: { code: formData.get("code") },
    run: (actor, data) => serverRuntime().identity.confirmEmailVerification(actor, data),
  });
  if (!result.ok) return failed(result.error);
  const confirmed = result.value;
  if (!confirmed.ok) {
    return failed(confirmed.reason, "retryAt" in confirmed ? confirmed.retryAt : undefined);
  }
  refresh();
  return {
    status: "berhasil",
    message: `${confirmed.email} sekarang Email Terverifikasi Anda: Kode Masuk berikutnya dikirim ke email ini.`,
  };
}

/** The Akun's phone number: a contact, validated (+62) and never verified. */
export async function simpanNomorTelepon(_previous: EmailProfileState, formData: FormData): Promise<EmailProfileState> {
  const result = await guarded({
    action: "akun.telepon",
    resource: (actor) => akunResource(actor.accountId),
    schema: z.object({ phoneNumber: phoneNumberInput }),
    input: { phoneNumber: formData.get("phoneNumber") },
    run: (actor, data) => serverRuntime().identity.updatePhoneNumber(actor, data),
  });
  if (!result.ok) return failed(result.error);
  if (!result.value.ok) return failed(result.value.reason);
  refresh();
  return { status: "berhasil", message: `Nomor telepon disimpan: ${result.value.phoneNumber}.` };
}

function failed(reason: IdentityRefusal | GuardError, retryAt?: Date): EmailProfileState {
  return { status: "gagal", message: identityMessage(reason, retryAt, serverRuntime().adapters.clock.now()) };
}
