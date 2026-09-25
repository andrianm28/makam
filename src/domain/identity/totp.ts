import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import type { Role, TotpStatus } from "./authorize";
import { identitySession, identityTotp } from "./schema";
import { activeSession } from "./sessions";

/*
 * Admin Platform TOTP (RFC 6238), kept in the module rather than in Better
 * Auth's twoFactor plugin: that plugin computes codes from the system time
 * (`Date.now()` in @better-auth/utils/otp) and so cannot take the Clock, and it
 * expects a password account to enable 2FA. Same approach as the login OTP.
 */

/** HMAC-SHA1, as every authenticator app expects by default. */
export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_SECONDS = 30;
/** Codes of one step before and after the Clock's step also pass (clock drift, typing time). */
export const TOTP_WINDOW_STEPS = 1;
/** The 5th wrong TOTP code in a session ends that session; the Admin Platform logs in by OTP again. */
export const TOTP_MAX_WRONG_ATTEMPTS = 5;
/** 20 random bytes (160 bits), as RFC 4226 recommends; 32 base32 characters. */
const SECRET_BYTES = 20;
const ISSUER = "Makam.co.id";

export interface TotpDeps {
  db: Database;
  clock: Clock;
  secret: string;
  /** 32 bytes, base64 (TOTP_ENCRYPTION_KEY). */
  totpEncryptionKey: string;
}

/** Where a session of an Akun with these roles stands on TOTP. */
export async function totpStatus(
  db: Database,
  input: { accountId: string; roles: Role[]; totpPassedAt: Date | null },
): Promise<TotpStatus> {
  if (!input.roles.includes("admin_platform")) return "tidak_perlu";
  if (input.totpPassedAt) return "lolos";
  const [row] = await db
    .select({ confirmedAt: identityTotp.confirmedAt })
    .from(identityTotp)
    .where(eq(identityTotp.accountId, input.accountId));
  return row?.confirmedAt ? "perlu_verifikasi" : "perlu_daftar";
}

export type StartTotpEnrolmentResult =
  | {
      ok: true;
      /** Base32, for typing into the authenticator app. */
      secret: string;
      /** The otpauth:// URI an authenticator app can import (or a QR code can carry). */
      otpauthUri: string;
    }
  | { ok: false; reason: "belum_masuk" | "tidak_perlu_totp" | "totp_sudah_terdaftar" };

/**
 * Starts (or restarts) TOTP enrolment for the signed-in Admin Platform. The
 * enrolment is complete once `passTotp` accepts a code for it. An enrolled
 * authenticator cannot be replaced here: there is no self-service recovery.
 */
export async function startTotpEnrolment(
  deps: TotpDeps,
  cookieHeader: string | null | undefined,
): Promise<StartTotpEnrolmentResult> {
  const session = await activeSession(deps, cookieHeader);
  if (!session) return { ok: false, reason: "belum_masuk" };
  if (!session.roles.includes("admin_platform")) return { ok: false, reason: "tidak_perlu_totp" };

  const secret = base32Encode(randomBytes(SECRET_BYTES));
  const ciphertext = seal(deps.totpEncryptionKey, secret);
  const now = deps.clock.now();
  const [stored] = await deps.db
    .insert(identityTotp)
    .values({ accountId: session.accountId, secretCiphertext: ciphertext, createdAt: now })
    .onConflictDoUpdate({
      target: identityTotp.accountId,
      set: { secretCiphertext: ciphertext, createdAt: now, lastUsedStep: null },
      // Only a pending enrolment may be replaced.
      setWhere: isNull(identityTotp.confirmedAt),
    })
    .returning({ accountId: identityTotp.accountId });
  if (!stored) return { ok: false, reason: "totp_sudah_terdaftar" };

  const label = encodeURIComponent(`${ISSUER}:${session.phoneNumber}`).replace("%3A", ":");
  return {
    ok: true,
    secret,
    otpauthUri:
      `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(ISSUER)}` +
      `&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_SECONDS}`,
  };
}

export type PassTotpResult =
  | { ok: true }
  | {
      ok: false;
      reason: "belum_masuk" | "tidak_perlu_totp" | "belum_daftar" | "kode_salah" | "kode_sudah_dipakai" | "sesi_diakhiri";
    };

/**
 * Checks an authenticator code for the signed-in Admin Platform's session. A
 * pass marks the session (and completes a pending enrolment); each code works
 * once; the `TOTP_MAX_WRONG_ATTEMPTS`th wrong code ends the session.
 */
export async function passTotp(
  deps: TotpDeps,
  cookieHeader: string | null | undefined,
  code: string,
): Promise<PassTotpResult> {
  const session = await activeSession(deps, cookieHeader);
  if (!session) return { ok: false, reason: "belum_masuk" };
  if (!session.roles.includes("admin_platform")) return { ok: false, reason: "tidak_perlu_totp" };

  const [totp] = await deps.db.select().from(identityTotp).where(eq(identityTotp.accountId, session.accountId));
  if (!totp) return { ok: false, reason: "belum_daftar" };

  const key = Buffer.from(base32Decode(open(deps.totpEncryptionKey, totp.secretCiphertext)));
  const now = deps.clock.now();
  const step = Math.floor(now.getTime() / 1000 / TOTP_PERIOD_SECONDS);
  const matched = /^\d+$/.test(code) && code.length === TOTP_DIGITS ? matchingStep(key, code, step) : null;

  if (matched === null) {
    const [counted] = await deps.db
      .update(identitySession)
      .set({ totpWrongAttempts: sql`${identitySession.totpWrongAttempts} + 1` })
      .where(eq(identitySession.token, session.token))
      .returning({ wrongAttempts: identitySession.totpWrongAttempts });
    if (!counted || counted.wrongAttempts >= TOTP_MAX_WRONG_ATTEMPTS) {
      await deps.db.delete(identitySession).where(eq(identitySession.token, session.token));
      return { ok: false, reason: "sesi_diakhiri" };
    }
    return { ok: false, reason: "kode_salah" };
  }

  // Accept each step's code once: the step must be newer than the last one used.
  const [used] = await deps.db
    .update(identityTotp)
    .set({ lastUsedStep: matched, confirmedAt: totp.confirmedAt ?? now })
    .where(
      and(
        eq(identityTotp.accountId, session.accountId),
        or(isNull(identityTotp.lastUsedStep), lt(identityTotp.lastUsedStep, matched)),
      ),
    )
    .returning({ accountId: identityTotp.accountId });
  if (!used) return { ok: false, reason: "kode_sudah_dipakai" };

  await deps.db
    .update(identitySession)
    .set({ totpPassedAt: now, updatedAt: now })
    .where(eq(identitySession.token, session.token));
  return { ok: true };
}

/** The step within the window whose code equals `code`, or null. */
function matchingStep(key: Buffer, code: string, step: number): number | null {
  for (let offset = -TOTP_WINDOW_STEPS; offset <= TOTP_WINDOW_STEPS; offset++) {
    const expected = Buffer.from(hotp(key, step + offset));
    if (timingSafeEqual(expected, Buffer.from(code))) return step + offset;
  }
  return null;
}

/** RFC 4226 HOTP with HMAC-SHA1 and dynamic truncation. */
function hotp(key: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 10 ** TOTP_DIGITS).toString().padStart(TOTP_DIGITS, "0");
}

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Encode(bytes: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text: string): Uint8Array {
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of text) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("TOTP secret is not base32");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

/** AES-256-GCM: `v1.<iv>.<tag>.<ciphertext>`, each part base64url. */
function seal(keyBase64: string, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv, cipher.getAuthTag(), ciphertext].map((part) => (typeof part === "string" ? part : part.toString("base64url"))).join(".");
}

/** Opens a `seal`ed value; throws when the key is wrong or the value was altered. */
function open(keyBase64: string, sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unknown TOTP secret format");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
