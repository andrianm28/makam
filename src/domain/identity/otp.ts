import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, max, sql, sum, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import type { LockKey } from "./lock-key";
import { identityIpRequest, identityOtpRequest, type otpPurposes } from "./schema";

/*
 * The code rules shared by every code the identity module sends, all by
 * email (ADR 0004): the Kode Masuk and the Verifikasi Email code.
 */

/** Digits in a code. */
export const OTP_LENGTH = 6;
/** A code works for 10 minutes; its email says so. */
export const OTP_EXPIRES_AFTER_MS = 10 * 60_000;
/** The 5th wrong code burns the code; a new one must be sent. */
export const OTP_MAX_WRONG_ATTEMPTS = 5;
/** "Kirim ulang" opens 60 s after the last code of the same kind to the same email (and any request from the same IP). */
export const OTP_RESEND_AFTER_MS = 60_000;
/** At most 5 codes to one email (and requests from one IP) in any rolling 60 minutes. */
export const OTP_MAX_SENDS_PER_WINDOW = 5;
export const OTP_SEND_WINDOW_MS = 60 * 60_000;
/**
 * 10 wrong codes within 60 minutes lock for 60 minutes: no code sent, none
 * accepted. Counted per lock key (./lock-key.ts).
 */
export const OTP_LOCKOUT_WRONG_CODES = 10;
export const OTP_LOCKOUT_WINDOW_MS = 60 * 60_000;
export const OTP_LOCKOUT_MS = 60 * 60_000;

export type OtpPurpose = (typeof otpPurposes)[number];

export interface CodeDeps {
  db: Database;
  clock: Clock;
  secret: string;
}

/** What the limits say about sending one more code. */
export type LimitRefusal = { ok: false; reason: "tunggu_kirim_ulang" | "terlalu_sering" | "terkunci"; retryAt: Date };

export interface CodeRequest {
  /** The (normalised) email the code goes to. */
  target: string;
  purpose: OtpPurpose;
  lockKey: LockKey;
}

export type IssueCodeResult =
  | { ok: true; sentAt: Date; expiresAt: Date; resendAt: Date }
  | LimitRefusal
  | { ok: false; reason: "gagal_kirim"; error: unknown };

/**
 * Sends one code under the shared rules: refused while the lock key is locked,
 * within 60 s of the last code of the same kind to the same email, or after 5
 * to it in the rolling hour. The code is stored only as an HMAC. A send that
 * throws is not counted against the limits.
 */
export async function issueCode(
  deps: CodeDeps,
  request: CodeRequest,
  deliver: (code: string) => Promise<unknown>,
): Promise<IssueCodeResult> {
  const now = deps.clock.now();
  const code = generateCode();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRES_AFTER_MS);

  const outcome = await deps.db.transaction(async (tx) => {
    // One request at a time per email, so two quick taps cannot both pass the limits.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`identity.otp:email:${request.target}`}))`);
    const locked = await lockedUntil(tx, request.lockKey, now);
    if (locked) return { ok: false, reason: "terkunci", retryAt: locked } as const;
    const recent = await tx
      .select({ sentAt: identityOtpRequest.sentAt, purpose: identityOtpRequest.purpose })
      .from(identityOtpRequest)
      .where(
        and(
          eq(identityOtpRequest.target, request.target),
          gt(identityOtpRequest.sentAt, new Date(now.getTime() - OTP_SEND_WINDOW_MS)),
        ),
      )
      .orderBy(desc(identityOtpRequest.sentAt));
    // "Kirim ulang" waits for the last code of the same kind; the hourly limit counts every code to the email.
    const refusal = sendLimitRefusal(
      recent.map((row) => row.sentAt),
      now,
      recent.filter((row) => row.purpose === request.purpose).map((row) => row.sentAt),
    );
    if (refusal) return refusal;
    const [created] = await tx
      .insert(identityOtpRequest)
      .values({
        ...request,
        channel: "email",
        codeHash: hashCode(deps.secret, request.target, code),
        sentAt: now,
        expiresAt,
      })
      .returning({ id: identityOtpRequest.id });
    return { ok: true, id: created.id } as const;
  });
  if (!outcome.ok) return outcome;

  try {
    await deliver(code);
  } catch (error) {
    // The code never left, so it does not count against the limits.
    await deps.db.delete(identityOtpRequest).where(eq(identityOtpRequest.id, outcome.id));
    return { ok: false, reason: "gagal_kirim", error };
  }
  return { ok: true, sentAt: now, expiresAt, resendAt: new Date(now.getTime() + OTP_RESEND_AFTER_MS) };
}

/**
 * Counts one request for an emailed code from `ip`, unless the IP is over its
 * limits (60 s between requests, 5 in any rolling hour). Every request counts,
 * whether or not a code goes out.
 */
export async function claimIpRequest(deps: CodeDeps, ip: string): Promise<{ ok: true } | LimitRefusal> {
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`identity.ip:${ip}`}))`);
    const recent = await tx
      .select({ at: identityIpRequest.requestedAt })
      .from(identityIpRequest)
      .where(
        and(eq(identityIpRequest.ip, ip), gt(identityIpRequest.requestedAt, new Date(now.getTime() - OTP_SEND_WINDOW_MS))),
      )
      .orderBy(desc(identityIpRequest.requestedAt));
    const refusal = sendLimitRefusal(
      recent.map((row) => row.at),
      now,
    );
    if (refusal) return refusal;
    await tx.insert(identityIpRequest).values({ ip, requestedAt: now });
    return { ok: true } as const;
  });
}

/**
 * Gives back an IP request counted by `claimIpRequest` at `requestedAt`, when
 * no code left after all (the EmailSender refused): a failed send counts
 * against no limit.
 */
export async function releaseIpRequest(deps: { db: Database }, ip: string, requestedAt: Date): Promise<void> {
  const [claimed] = await deps.db
    .select({ id: identityIpRequest.id })
    .from(identityIpRequest)
    .where(and(eq(identityIpRequest.ip, ip), eq(identityIpRequest.requestedAt, requestedAt)))
    .orderBy(desc(identityIpRequest.requestedAt))
    .limit(1);
  if (claimed) await deps.db.delete(identityIpRequest).where(eq(identityIpRequest.id, claimed.id));
}

/** The per-IP request records are kept this long; the limits only ever look back 60 minutes. */
export const IP_REQUESTS_KEPT_MS = 24 * 3_600_000;

/**
 * Scheduler tick: deletes the per-IP request records older than 24 hours at
 * `now`. Idempotent: a second run for the same `now` deletes nothing.
 */
export async function pruneIpRequests(ctx: { db: Database }, now: Date): Promise<{ deleted: number }> {
  const deleted = await ctx.db
    .delete(identityIpRequest)
    .where(lt(identityIpRequest.requestedAt, new Date(now.getTime() - IP_REQUESTS_KEPT_MS)))
    .returning({ id: identityIpRequest.id });
  return { deleted: deleted.length };
}

/**
 * The 60 s and 5-per-hour rules over earlier sends (newest first) within the
 * window; the 60 s wait looks only at `resendNewestFirst` (default: all of them).
 */
function sendLimitRefusal(sentNewestFirst: Date[], now: Date, resendNewestFirst = sentNewestFirst): LimitRefusal | null {
  const [last] = resendNewestFirst;
  if (last) {
    const retryAt = new Date(last.getTime() + OTP_RESEND_AFTER_MS);
    if (now.getTime() < retryAt.getTime()) return { ok: false, reason: "tunggu_kirim_ulang", retryAt };
  }
  if (sentNewestFirst.length >= OTP_MAX_SENDS_PER_WINDOW) {
    // The window reopens when the oldest send that keeps it full drops out of it.
    const oldestCounted = sentNewestFirst[OTP_MAX_SENDS_PER_WINDOW - 1];
    return { ok: false, reason: "terlalu_sering", retryAt: new Date(oldestCounted.getTime() + OTP_SEND_WINDOW_MS) };
  }
  return null;
}

export type CodeRejection =
  | { ok: false; reason: "kode_salah" | "kode_kedaluwarsa" | "terlalu_banyak_percobaan" }
  | { ok: false; reason: "terkunci"; retryAt: Date };

/** A correct code: the email it was sent to. */
export type CheckCodeResult = { ok: true; target: string } | CodeRejection;

/**
 * Which code a typed code is checked against: the latest one of this kind
 * sent under the lock key, and, for a Kode Masuk, to this email.
 */
export type CodeLookup = { purpose: OtpPurpose; lockKey: LockKey; target?: string };

/**
 * Checks a typed code against the latest code matching `lookup`. A correct
 * code is used up; the `OTP_MAX_WRONG_ATTEMPTS`th wrong code burns it; the
 * `OTP_LOCKOUT_WRONG_CODES`th wrong code under the lock key within the
 * lockout window locks it.
 */
export async function checkCode(deps: CodeDeps, input: { lookup: CodeLookup; code: string }): Promise<CheckCodeResult> {
  const now = deps.clock.now();
  const { lockKey } = input.lookup;
  const locked = await lockedUntil(deps.db, lockKey, now);
  if (locked) return { ok: false, reason: "terkunci", retryAt: locked };

  const [latest] = await deps.db
    .select()
    .from(identityOtpRequest)
    .where(lookupWhere(input.lookup))
    .orderBy(desc(identityOtpRequest.sentAt))
    .limit(1);

  if (!latest) return { ok: false, reason: "kode_salah" };
  if (latest.closedReason === "terlalu_banyak_percobaan") return { ok: false, reason: "terlalu_banyak_percobaan" };
  if (latest.closedAt) return { ok: false, reason: "kode_salah" };
  if (latest.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "kode_kedaluwarsa" };

  const stillOpen = and(eq(identityOtpRequest.id, latest.id), isNull(identityOtpRequest.closedAt));

  if (!sameHash(latest.codeHash, hashCode(deps.secret, latest.target, input.code))) {
    const [counted] = await deps.db
      .update(identityOtpRequest)
      .set({ wrongAttempts: sql`${identityOtpRequest.wrongAttempts} + 1` })
      .where(stillOpen)
      .returning({ wrongAttempts: identityOtpRequest.wrongAttempts });
    if (!counted) return { ok: false, reason: "kode_salah" };

    if ((await recentWrongCodes(deps.db, lockKey, now)) >= OTP_LOCKOUT_WRONG_CODES) {
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
  return used.length === 1 ? { ok: true, target: latest.target } : { ok: false, reason: "kode_salah" };
}

function lookupWhere(lookup: CodeLookup): SQL | undefined {
  return and(
    eq(identityOtpRequest.purpose, lookup.purpose),
    eq(identityOtpRequest.lockKey, lookup.lockKey),
    lookup.target === undefined ? undefined : eq(identityOtpRequest.target, lookup.target),
  );
}

/** When the lock key's lockout ends, if it is locked at `now`. */
async function lockedUntil(db: Database, lockKey: string, now: Date): Promise<Date | null> {
  const [row] = await db
    .select({ until: max(identityOtpRequest.lockedUntil) })
    .from(identityOtpRequest)
    .where(and(eq(identityOtpRequest.lockKey, lockKey), gt(identityOtpRequest.lockedUntil, now)));
  return row?.until ?? null;
}

/**
 * Wrong codes typed for the codes sent under the lock key in the lockout
 * window. Codes live 10 minutes, so every one of those wrong codes was typed
 * within the window plus 10 minutes.
 */
async function recentWrongCodes(db: Database, lockKey: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ total: sum(identityOtpRequest.wrongAttempts).mapWith(Number) })
    .from(identityOtpRequest)
    .where(
      and(
        eq(identityOtpRequest.lockKey, lockKey),
        gt(identityOtpRequest.sentAt, new Date(now.getTime() - OTP_LOCKOUT_WINDOW_MS)),
      ),
    );
  return row?.total ?? 0;
}

function generateCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

function hashCode(secret: string, target: string, code: string): string {
  return createHmac("sha256", secret).update(`${target}:${code}`).digest("hex");
}

/** Compares two hex HMAC-SHA256 digests in constant time. */
function sameHash(storedHex: string, typedHex: string): boolean {
  const stored = Buffer.from(storedHex, "hex");
  const typed = Buffer.from(typedHex, "hex");
  // Both are SHA-256 digests (32 bytes); timingSafeEqual needs equal lengths.
  return stored.length === typed.length && timingSafeEqual(stored, typed);
}
