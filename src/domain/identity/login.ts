import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { Role } from "./authorize";
import { sessionLengthMs, type MakamAuth } from "./better-auth";
import { akunLockKey, akunOfNumber, checkCode, type CodeLookup, type CodeRejection } from "./otp";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identitySession, identityUser } from "./schema";
import { findSession, sessionCookiesFrom, type SessionCookie } from "./sessions";
import { acceptOpenInvites } from "./invites";
import { rolesOf } from "./staff";

export interface Account {
  id: string;
  /** Canonical E.164 WhatsApp number. */
  phoneNumber: string;
}

export type VerifyOtpResult =
  | {
      ok: true;
      account: Account;
      /** True when this Kode Masuk created the account (a number with no account yet; WhatsApp only). */
      accountCreated: boolean;
      /** Every role the Akun holds after this login (open Undangan Staf accepted). */
      roles: Role[];
      session: { expiresAt: Date; cookies: SessionCookie[] };
    }
  | PhoneNumberRejection
  | CodeRejection;

export interface LoginDeps {
  auth: MakamAuth;
  db: Database;
  clock: Clock;
  audit: AuditLog;
  secret: string;
  /** One-time proofs handed to Better Auth after the module checked a Kode Masuk (see ./better-auth.ts). */
  proofs: LoginProofs;
}

/** One-time login proofs, per identity instance: issued by the module, consumed by Better Auth's hook. */
export class LoginProofs {
  readonly #open = new Map<string, string>();

  issue(phoneNumber: string): string {
    const proof = randomBytes(32).toString("hex");
    this.#open.set(proof, phoneNumber);
    return proof;
  }

  consume(phoneNumber: string, proof: string): boolean {
    const owner = this.#open.get(proof);
    this.#open.delete(proof);
    return owner === phoneNumber;
  }
}

/**
 * A correct WhatsApp Kode Masuk logs into the number's account, creating it
 * first when the number has none (story 26: no sign-up).
 */
export async function verifyOtp(
  deps: LoginDeps,
  input: { phoneNumber: string; code: string },
): Promise<VerifyOtpResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;

  const akun = await akunOfNumber(deps.db, phoneNumber);
  return logInAkun(deps, {
    phoneNumber,
    lookup: { channel: "whatsapp", target: phoneNumber, purpose: "masuk" },
    lockKey: akun ? akunLockKey(akun.id) : `wa:${phoneNumber}`,
    code: input.code,
    mayCreate: true,
  });
}

/**
 * Checks the Kode Masuk, then signs the number's Akun in: Better Auth makes
 * the session (and, only when `mayCreate`, the Akun), open Undangan Staf are
 * accepted, and the session gets the strictest length of the roles now held.
 */
export async function logInAkun(
  deps: LoginDeps,
  input: { phoneNumber: string; lookup: CodeLookup; lockKey: string; code: string; mayCreate: boolean },
): Promise<VerifyOtpResult> {
  const checked = await checkCode(deps, { lookup: input.lookup, lockKey: input.lockKey, code: input.code });
  if (!checked.ok) return checked;
  const { phoneNumber } = input;

  const [existing] = await deps.db
    .select({ id: identityUser.id })
    .from(identityUser)
    .where(eq(identityUser.phoneNumber, phoneNumber));
  if (!existing && !input.mayCreate) throw new Error("An email Kode Masuk never creates an Akun");

  const { response, headers } = await deps.auth.api.verifyPhoneNumber({
    body: { phoneNumber, code: deps.proofs.issue(phoneNumber) },
    returnHeaders: true,
  });
  if (!response.user || !response.token) throw new Error("Better Auth verified the number but made no session");
  const session = await findSession(deps.auth, response.token);
  if (!session) throw new Error("Better Auth reported a session it did not store");

  await acceptOpenInvites(deps, { id: response.user.id, phoneNumber }, response.token);
  // The session lasts as long as the strictest role the Akun now holds allows.
  const roles = await rolesOf(deps.db, response.user.id);
  const lengthMs = sessionLengthMs(roles);
  const expiresAt = new Date(session.session.createdAt.getTime() + lengthMs);
  await deps.db.update(identitySession).set({ expiresAt }).where(eq(identitySession.token, response.token));
  const sessionCookie = (await deps.auth.$context).authCookies.sessionToken.name;
  const cookies = sessionCookiesFrom(headers).map((cookie) =>
    cookie.name === sessionCookie ? { ...cookie, maxAge: lengthMs / 1000, expires: undefined } : cookie,
  );

  return {
    ok: true,
    account: { id: response.user.id, phoneNumber },
    accountCreated: !existing,
    roles,
    session: { expiresAt, cookies },
  };
}

/** The account keyed by this WhatsApp number (any spelling), or null. */
export async function accountByPhoneNumber(deps: { db: Database }, typed: string): Promise<Account | null> {
  const normalised = normalisePhoneNumber(typed);
  if (!normalised.ok) return null;
  const [row] = await deps.db
    .select({ id: identityUser.id, phoneNumber: identityUser.phoneNumber })
    .from(identityUser)
    .where(eq(identityUser.phoneNumber, normalised.phoneNumber));
  return row?.phoneNumber ? { id: row.id, phoneNumber: row.phoneNumber } : null;
}
