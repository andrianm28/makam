import { createHmac, randomInt } from "node:crypto";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";
import { normalisePhoneNumber } from "./phone-number";
import { identityOtpRequest } from "./schema";

/** Meta's authentication template (whatsapp-templates.md #1). */
export const OTP_TEMPLATE = "kode_verifikasi";
export const OTP_TEMPLATE_LANGUAGE = "id";
/** Digits in a code. */
export const OTP_LENGTH = 6;
/** A code works for 10 minutes; the template footer says so (`code_expiration_minutes: 10`). */
export const OTP_EXPIRES_AFTER_MS = 10 * 60_000;

export interface OtpDeps {
  db: Database;
  clock: Clock;
  whatsapp: WhatsAppSender;
  secret: string;
}

export type RequestOtpResult =
  | { ok: true; phoneNumber: string; sentAt: Date; expiresAt: Date }
  | { ok: false; reason: "nomor_tidak_valid" };

export async function requestOtp(deps: OtpDeps, input: { phoneNumber: string }): Promise<RequestOtpResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;

  const now = deps.clock.now();
  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRES_AFTER_MS);

  await deps.db.insert(identityOtpRequest).values({
    phoneNumber,
    codeHash: hashCode(deps.secret, phoneNumber, code),
    sentAt: now,
    expiresAt,
  });
  await deps.whatsapp.sendTemplate({
    to: phoneNumber,
    template: OTP_TEMPLATE,
    language: OTP_TEMPLATE_LANGUAGE,
    parameters: [code],
    copyCode: code,
  });

  return { ok: true, phoneNumber, sentAt: now, expiresAt };
}

function generateCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashCode(secret: string, phoneNumber: string, code: string): string {
  return createHmac("sha256", secret).update(`${phoneNumber}:${code}`).digest("hex");
}
