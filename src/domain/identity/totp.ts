import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { Actor, Role, TotpStatus } from "./authorize";
import type { Account } from "./login";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identitySession, identityTotp, identityUser } from "./schema";
import { actorSession } from "./sessions";
import { rolesOf } from "./staff";
import { openTotpSecret, sealTotpSecret } from "./totp-secret-box";

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
/** The account name the authenticator app shows: never the phone number or anything else identifying. */
const ACCOUNT_LABEL = "Admin Platform";

export interface TotpDeps {
  db: Database;
  clock: Clock;
  secret: string;
  /** 32 bytes, base64 (TOTP_ENCRYPTION_KEY). */
  totpEncryptionKey: string;
  audit: AuditLog;
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
 * Starts (or restarts) TOTP enrolment for the signed-in Admin Platform `by`. The
 * enrolment is complete once `passTotp` accepts a code for it. An enrolled
 * authenticator cannot be replaced here: there is no self-service recovery.
 */
export async function startTotpEnrolment(deps: TotpDeps, by: Actor): Promise<StartTotpEnrolmentResult> {
  const session = await actorSession(deps, by);
  if (!session) return { ok: false, reason: "belum_masuk" };
  if (!session.roles.includes("admin_platform")) return { ok: false, reason: "tidak_perlu_totp" };

  const secret = base32Encode(randomBytes(SECRET_BYTES));
  const ciphertext = sealTotpSecret(deps.totpEncryptionKey, session.accountId, secret);
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

  const label = `${encodeURIComponent(ISSUER)}:${encodeURIComponent(ACCOUNT_LABEL)}`;
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
 * Checks an authenticator code for the signed-in Admin Platform `by`'s session. A
 * pass marks the session (and completes a pending enrolment); each code works
 * once; the `TOTP_MAX_WRONG_ATTEMPTS`th wrong code ends the session.
 */
export async function passTotp(deps: TotpDeps, by: Actor, code: string): Promise<PassTotpResult> {
  const session = await actorSession(deps, by);
  if (!session) return { ok: false, reason: "belum_masuk" };
  if (!session.roles.includes("admin_platform")) return { ok: false, reason: "tidak_perlu_totp" };

  const [totp] = await deps.db.select().from(identityTotp).where(eq(identityTotp.accountId, session.accountId));
  if (!totp) return { ok: false, reason: "belum_daftar" };

  const key = Buffer.from(base32Decode(openTotpSecret(deps.totpEncryptionKey, session.accountId, totp.secretCiphertext)));
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

  // Accept each step's code once: the step must be newer than the last one used; the pass marks the session.
  const usePassingCode = async (tx: Database) => {
    const [used] = await tx
      .update(identityTotp)
      .set({ lastUsedStep: matched, confirmedAt: totp.confirmedAt ?? now })
      .where(
        and(
          eq(identityTotp.accountId, session.accountId),
          or(isNull(identityTotp.lastUsedStep), lt(identityTotp.lastUsedStep, matched)),
        ),
      )
      .returning({ accountId: identityTotp.accountId });
    if (!used) return { ok: false, reason: "kode_sudah_dipakai" } as const;
    await tx
      .update(identitySession)
      .set({ totpPassedAt: now, updatedAt: now })
      .where(eq(identitySession.token, session.token));
    return { ok: true } as const;
  };

  // Passing TOTP on an enrolled authenticator is a login step, not a staff write.
  if (totp.confirmedAt) return deps.db.transaction(usePassingCode);

  // The first passing code completes the enrolment: a staff write on the Akun.
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const passed = await usePassingCode(tx);
    if (!passed.ok) return passed;
    await record({
      actor: { accountId: session.accountId, role: "admin_platform" },
      action: "akun.totp_daftar",
      entity: { kind: "akun", id: session.accountId },
      before: { terdaftar: false },
      after: { terdaftar: true },
      reason: null,
    });
    return passed;
  });
}

export type ResetTotpResult =
  | { ok: true; account: Account }
  | PhoneNumberRejection
  | { ok: false; reason: "alasan_wajib" | "bukan_admin_platform" | "totp_belum_terdaftar" };

/**
 * Ops' TOTP reset (`reset-totp` CLI; there is no self-service recovery): clears
 * the Admin Platform's enrolled authenticator and ends every session of the
 * Akun, so its next login enrols TOTP again. Audited as `ops_cli` with the
 * reason; the entry says only that the authenticator was enrolled and is not now.
 */
export async function resetTotp(
  deps: { db: Database; audit: AuditLog },
  input: { phoneNumber: string; reason: string },
): Promise<ResetTotpResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "alasan_wajib" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [user] = await tx
      .select({ id: identityUser.id })
      .from(identityUser)
      .where(eq(identityUser.phoneNumber, normalised.phoneNumber));
    if (!user || !(await rolesOf(tx, user.id)).includes("admin_platform")) {
      return { ok: false, reason: "bukan_admin_platform" } as const;
    }
    const [enrolled] = await tx
      .select({ confirmedAt: identityTotp.confirmedAt })
      .from(identityTotp)
      .where(eq(identityTotp.accountId, user.id))
      .for("update");
    if (!enrolled?.confirmedAt) return { ok: false, reason: "totp_belum_terdaftar" } as const;

    await tx.delete(identityTotp).where(eq(identityTotp.accountId, user.id));
    await tx.delete(identitySession).where(eq(identitySession.userId, user.id));
    await record({
      // No one is signed in: the entry names the Akun reset, acting as the ops CLI.
      actor: { accountId: user.id, role: "ops_cli" },
      action: "akun.totp_reset",
      entity: { kind: "akun", id: user.id },
      before: { terdaftar: true },
      after: { terdaftar: false },
      reason,
    });
    return { ok: true, account: { id: user.id, phoneNumber: normalised.phoneNumber } } as const;
  });
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
