import { createHmac, randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull, max, sql, sum } from "drizzle-orm";
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
/** The fallback slot (ticket 60: "Kirim lewat email" or the CS WhatsApp pointer) shows 60 s after the OTP was sent. */
export const OTP_FALLBACK_AFTER_MS = 60_000;
/** At most 5 OTPs to one number in any rolling 60 minutes. */
export const OTP_MAX_SENDS_PER_WINDOW = 5;
export const OTP_SEND_WINDOW_MS = 60 * 60_000;
/** 10 wrong codes for one number within 60 minutes lock it for 60 minutes: no OTP sent, no code accepted. */
export const OTP_LOCKOUT_WRONG_CODES = 10;
export const OTP_LOCKOUT_WINDOW_MS = 60 * 60_000;
export const OTP_LOCKOUT_MS = 60 * 60_000;

export interface OtpDeps {
  db: Database;
  clock: Clock;
  whatsapp: WhatsAppSender;
  secret: string;
}

export type RequestOtpResult =
  | {
      ok: true;
      phoneNumber: string;
      sentAt: Date;
      expiresAt: Date;
      /** When "Kirim ulang" opens. */
      resendAt: Date;
      /** When the OTP screen shows its fallback slot ("Kirim lewat email", ticket 60). */
      fallbackAt: Date;
    }
  | { ok: false; reason: "nomor_tidak_valid" | "nomor_bukan_indonesia" | "gagal_kirim" }
  | { ok: false; reason: "tunggu_kirim_ulang" | "terlalu_sering" | "terkunci"; retryAt: Date };

export async function requestOtp(deps: OtpDeps, input: { phoneNumber: string }): Promise<RequestOtpResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;

  const now = deps.clock.now();
  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRES_AFTER_MS);

  const outcome = await deps.db.transaction(async (tx) => {
    // One request at a time per number, so two quick taps cannot both pass the limits.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`identity.otp:${phoneNumber}`}))`);
    const locked = await lockedUntil(tx, phoneNumber, now);
    if (locked) return { ok: false, reason: "terkunci", retryAt: locked } as const;
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
    const [created] = await tx
      .insert(identityOtpRequest)
      .values({ phoneNumber, codeHash: hashCode(deps.secret, phoneNumber, code), sentAt: now, expiresAt })
      .returning({ id: identityOtpRequest.id });
    return { ok: true, id: created.id } as const;
  });
  if (!outcome.ok) return outcome;

  try {
    await deps.whatsapp.sendTemplate({
      to: phoneNumber,
      template: OTP_TEMPLATE,
      language: OTP_TEMPLATE_LANGUAGE,
      parameters: [code],
      copyCode: code,
    });
  } catch {
    // WhatsApp never took the code, so it does not count against the limits.
    // An OTP failure raises no Antrean row (spec, Notifications): the Pemesan simply tries again.
    await deps.db.delete(identityOtpRequest).where(eq(identityOtpRequest.id, outcome.id));
    return { ok: false, reason: "gagal_kirim" };
  }

  return {
    ok: true,
    phoneNumber,
    sentAt: now,
    expiresAt,
    resendAt: new Date(now.getTime() + OTP_RESEND_AFTER_MS),
    fallbackAt: new Date(now.getTime() + OTP_FALLBACK_AFTER_MS),
  };
}

export type CodeRejection =
  | { ok: false; reason: "kode_salah" | "kode_kedaluwarsa" | "terlalu_banyak_percobaan" }
  | { ok: false; reason: "terkunci"; retryAt: Date };

export type CheckCodeResult = { ok: true } | CodeRejection;

/**
 * Checks a typed code against the number's latest OTP. A correct code is used
 * up; the `OTP_MAX_WRONG_ATTEMPTS`th wrong code burns it; the
 * `OTP_LOCKOUT_WRONG_CODES`th wrong code within the lockout window locks the number.
 */
export async function checkCode(
  deps: OtpDeps,
  input: { phoneNumber: string; code: string },
): Promise<CheckCodeResult> {
  const now = deps.clock.now();
  const locked = await lockedUntil(deps.db, input.phoneNumber, now);
  if (locked) return { ok: false, reason: "terkunci", retryAt: locked };

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
    if (!counted) return { ok: false, reason: "kode_salah" };

    if ((await recentWrongCodes(deps.db, input.phoneNumber, now)) >= OTP_LOCKOUT_WRONG_CODES) {
      const retryAt = new Date(now.getTime() + OTP_LOCKOUT_MS);
      await deps.db
        .update(identityOtpRequest)
        .set({ closedAt: now, closedReason: "terlalu_banyak_percobaan", lockedUntil: retryAt })
        .where(eq(identityOtpRequest.id, latest.id));
      return { ok: false, reason: "terkunci", retryAt };
    }

    if (counted.wrongAttempts < OTP_MAX_WRONG_ATTEMPTS) return { ok: false, reason: "kode_salah" };
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

/** When the number's lockout ends, if it is locked at `now`. */
async function lockedUntil(db: Database, phoneNumber: string, now: Date): Promise<Date | null> {
  const [row] = await db
    .select({ until: max(identityOtpRequest.lockedUntil) })
    .from(identityOtpRequest)
    .where(and(eq(identityOtpRequest.phoneNumber, phoneNumber), gt(identityOtpRequest.lockedUntil, now)));
  return row?.until ?? null;
}

/**
 * Wrong codes typed for the OTPs sent to the number in the lockout window.
 * Codes live 10 minutes, so every one of those wrong codes was typed within
 * the window plus 10 minutes.
 */
async function recentWrongCodes(db: Database, phoneNumber: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: sum(identityOtpRequest.wrongAttempts).mapWith(Number) })
    .from(identityOtpRequest)
    .where(
      and(
        eq(identityOtpRequest.phoneNumber, phoneNumber),
        gt(identityOtpRequest.sentAt, new Date(now.getTime() - OTP_LOCKOUT_WINDOW_MS)),
      ),
    );
  return row?.total ?? 0;
}

function generateCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function hashCode(secret: string, phoneNumber: string, code: string): string {
  return createHmac("sha256", secret).update(`${phoneNumber}:${code}`).digest("hex");
}
