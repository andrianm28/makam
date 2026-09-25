import { and, eq, isNotNull, sql } from "drizzle-orm";
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
import type { LoginProofs } from "./login-proofs";
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

/**
 * A correct Kode Masuk logs into the number's account. By WhatsApp it creates
 * the account first when the number has none (story 26: no sign-up). With
 * `channel: "email"` ("Kirim lewat email" on the same screen) the code is the
 * one sent to the Email Terverifikasi of the number's existing Akun.
 */
export async function verifyOtp(
  deps: LoginDeps,
  input: { phoneNumber: string; code: string; channel?: "whatsapp" | "email" },
): Promise<VerifyOtpResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;

  const akun = await akunOfNumber(deps.db, phoneNumber);
  if (input.channel === "email") {
    if (!akun?.verifiedEmail) return { ok: false, reason: "kode_salah" };
    return logInAkun(deps, {
      lookup: { channel: "email", target: akun.verifiedEmail, purpose: "masuk" },
      code: input.code,
      signsIn: (checked) => akunTheEmailCodeWasSentFor(deps.db, checked),
    });
  }
  return logInAkun(deps, {
    lookup: {
      channel: "whatsapp",
      target: phoneNumber,
      purpose: "masuk",
      lockKey: akun ? akunLockKey(akun.id) : `wa:${phoneNumber}`,
    },
    code: input.code,
    signsIn: async () => ({ phoneNumber, mayCreate: true }),
  });
}

/** Whom a correct Kode Masuk signs in: a number, and whether it may create its Akun (WhatsApp only). */
export type SignsIn = { phoneNumber: string; mayCreate: boolean };

/**
 * Checks the Kode Masuk, then signs in the number `signsIn` names for the
 * correct code (none: refused as a wrong code). Better Auth makes the session
 * (and, only when `mayCreate`, the Akun), open Undangan Staf are accepted, and
 * the session gets the strictest length of the roles now held.
 */
export async function logInAkun(
  deps: LoginDeps,
  input: { lookup: CodeLookup; code: string; signsIn: (checked: { target: string; lockKey: string }) => Promise<SignsIn | null> },
): Promise<VerifyOtpResult> {
  const checked = await checkCode(deps, { lookup: input.lookup, code: input.code });
  if (!checked.ok) return checked;
  const signsIn = await input.signsIn(checked);
  if (!signsIn) return { ok: false, reason: "kode_salah" };
  const { phoneNumber } = signsIn;

  const [existing] = await deps.db
    .select({ id: identityUser.id })
    .from(identityUser)
    .where(eq(identityUser.phoneNumber, phoneNumber));
  // Only a WhatsApp Kode Masuk creates an Akun (ADR 0003).
  if (!existing && !signsIn.mayCreate) return { ok: false, reason: "kode_salah" };

  const { response, headers } = await deps.proofs.during(phoneNumber, (proof) =>
    deps.auth.api.verifyPhoneNumber({ body: { phoneNumber, code: proof }, returnHeaders: true }),
  );
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

/**
 * The Akun an email Kode Masuk was sent for (named by the lock key it was sent
 * under), while `target` is still that Akun's Email Terverifikasi; else null.
 * It never names a number without an Akun.
 */
export async function akunTheEmailCodeWasSentFor(
  db: Database,
  checked: { target: string; lockKey: string },
): Promise<SignsIn | null> {
  const accountId = checked.lockKey.startsWith("akun:") ? checked.lockKey.slice("akun:".length) : null;
  if (!accountId) return null;
  const [row] = await db
    .select({ phoneNumber: identityUser.phoneNumber })
    .from(identityUser)
    .where(
      and(
        eq(identityUser.id, accountId),
        eq(sql`lower(${identityUser.contactEmail})`, checked.target),
        isNotNull(identityUser.emailVerifiedAt),
      ),
    );
  return row?.phoneNumber ? { phoneNumber: row.phoneNumber, mayCreate: false } : null;
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
