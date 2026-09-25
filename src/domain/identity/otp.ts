import { createHmac, randomInt } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
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

export type CheckCodeResult = { ok: true } | { ok: false; reason: "kode_salah" | "kode_kedaluwarsa" };

/** Checks a typed code against the number's open OTP; a correct code is used up. */
export async function checkCode(
  deps: OtpDeps,
  input: { phoneNumber: string; code: string },
): Promise<CheckCodeResult> {
  const now = deps.clock.now();
  const [open] = await deps.db
    .select()
    .from(identityOtpRequest)
    .where(and(eq(identityOtpRequest.phoneNumber, input.phoneNumber), isNull(identityOtpRequest.closedAt)))
    .orderBy(desc(identityOtpRequest.sentAt))
    .limit(1);
  if (open && open.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "kode_kedaluwarsa" };
  if (!open || open.codeHash !== hashCode(deps.secret, input.phoneNumber, input.code)) {
    return { ok: false, reason: "kode_salah" };
  }
  const used = await deps.db
    .update(identityOtpRequest)
    .set({ closedAt: now })
    .where(and(eq(identityOtpRequest.id, open.id), isNull(identityOtpRequest.closedAt)))
    .returning({ id: identityOtpRequest.id });
  return used.length === 1 ? { ok: true } : { ok: false, reason: "kode_salah" };
}

function generateCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashCode(secret: string, phoneNumber: string, code: string): string {
  return createHmac("sha256", secret).update(`${phoneNumber}:${code}`).digest("hex");
}
