import { createHmac, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
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
/** The 5th wrong code burns the OTP; the Pemesan must ask for a new one. */
export const OTP_MAX_WRONG_ATTEMPTS = 5;
/** "Kirim ulang" opens 60 s after the last OTP to the number, when the fallback slot also appears. */
export const OTP_RESEND_AFTER_MS = 60_000;
/** At most 5 OTPs to one number in any rolling 60 minutes. */
export const OTP_MAX_SENDS_PER_WINDOW = 5;
export const OTP_SEND_WINDOW_MS = 60 * 60_000;

export interface OtpDeps {
  db: Database;
  clock: Clock;
  whatsapp: WhatsAppSender;
  secret: string;
}

export type RequestOtpResult =
  | { ok: true; phoneNumber: string; sentAt: Date; expiresAt: Date }
  | { ok: false; reason: "nomor_tidak_valid" }
  | { ok: false; reason: "tunggu_kirim_ulang" | "terlalu_sering"; retryAt: Date };

export async function requestOtp(deps: OtpDeps, input: { phoneNumber: string }): Promise<RequestOtpResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;

  const now = deps.clock.now();
  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRES_AFTER_MS);

  const refused = await deps.db.transaction(async (tx) => {
    // One request at a time per number, so two quick taps cannot both pass the limits.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`identity.otp:${phoneNumber}`}))`);
    const recent = await tx
      .select({ sentAt: identityOtpRequest.sentAt })
      .from(identityOtpRequest)
      .where(
        and(
          eq(identityOtpRequest.phoneNumber, phoneNumber),
          gt(identityOtpRequest.sentAt, new Date(now.getTime() - OTP_SEND_WINDOW_MS)),
        ),
      )
      .orderBy(desc(identityOtpRequest.sentAt));
    const [last] = recent;
    if (last) {
      const retryAt = new Date(last.sentAt.getTime() + OTP_RESEND_AFTER_MS);
      if (now.getTime() < retryAt.getTime()) return { ok: false, reason: "tunggu_kirim_ulang", retryAt } as const;
    }
    if (recent.length >= OTP_MAX_SENDS_PER_WINDOW) {
      // The window reopens when the oldest send that keeps it full drops out of it.
      const oldestCounted = recent[OTP_MAX_SENDS_PER_WINDOW - 1];
      const retryAt = new Date(oldestCounted.sentAt.getTime() + OTP_SEND_WINDOW_MS);
      return { ok: false, reason: "terlalu_sering", retryAt } as const;
    }
    await tx.insert(identityOtpRequest).values({
      phoneNumber,
      codeHash: hashCode(deps.secret, phoneNumber, code),
      sentAt: now,
      expiresAt,
    });
    return null;
  });
  if (refused) return refused;

  await deps.whatsapp.sendTemplate({
    to: phoneNumber,
    template: OTP_TEMPLATE,
    language: OTP_TEMPLATE_LANGUAGE,
    parameters: [code],
    copyCode: code,
  });

  return { ok: true, phoneNumber, sentAt: now, expiresAt };
}

export type CheckCodeResult =
  | { ok: true }
  | { ok: false; reason: "kode_salah" | "kode_kedaluwarsa" | "terlalu_banyak_percobaan" };

/**
 * Checks a typed code against the number's latest OTP. A correct code is used
 * up; the `OTP_MAX_WRONG_ATTEMPTS`th wrong code burns it.
 */
export async function checkCode(
  deps: OtpDeps,
  input: { phoneNumber: string; code: string },
): Promise<CheckCodeResult> {
  const now = deps.clock.now();
  const [latest] = await deps.db
    .select()
    .from(identityOtpRequest)
    .where(eq(identityOtpRequest.phoneNumber, input.phoneNumber))
    .orderBy(desc(identityOtpRequest.sentAt))
    .limit(1);

  if (!latest) return { ok: false, reason: "kode_salah" };
  if (latest.closedReason === "terlalu_banyak_percobaan") return { ok: false, reason: "terlalu_banyak_percobaan" };
  if (latest.closedAt) return { ok: false, reason: "kode_salah" };
  if (latest.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "kode_kedaluwarsa" };

  const stillOpen = and(eq(identityOtpRequest.id, latest.id), isNull(identityOtpRequest.closedAt));

  if (latest.codeHash !== hashCode(deps.secret, input.phoneNumber, input.code)) {
    const [counted] = await deps.db
      .update(identityOtpRequest)
      .set({ wrongAttempts: sql`${identityOtpRequest.wrongAttempts} + 1` })
      .where(stillOpen)
      .returning({ wrongAttempts: identityOtpRequest.wrongAttempts });
    if (!counted || counted.wrongAttempts < OTP_MAX_WRONG_ATTEMPTS) return { ok: false, reason: "kode_salah" };
    await deps.db
      .update(identityOtpRequest)
      .set({ closedAt: now, closedReason: "terlalu_banyak_percobaan" })
      .where(stillOpen);
    return { ok: false, reason: "terlalu_banyak_percobaan" };
  }

  const used = await deps.db
    .update(identityOtpRequest)
    .set({ closedAt: now, closedReason: "dipakai" })
    .where(stillOpen)
    .returning({ id: identityOtpRequest.id });
  return used.length === 1 ? { ok: true } : { ok: false, reason: "kode_salah" };
}

function generateCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashCode(secret: string, phoneNumber: string, code: string): string {
  return createHmac("sha256", secret).update(`${phoneNumber}:${code}`).digest("hex");
}
