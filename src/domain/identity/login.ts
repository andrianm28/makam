import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { Role } from "./authorize";
import { OtpRejected, sessionLengthMs, type MakamAuth } from "./better-auth";
import type { CodeRejection } from "./otp";
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
      /** True when this OTP created the account (a number with no account yet). */
      accountCreated: boolean;
      /** Every role the Akun holds after this login (open Undangan Staf accepted). */
      roles: Role[];
      session: { expiresAt: Date; cookies: SessionCookie[] };
    }
  | PhoneNumberRejection
  | CodeRejection;

/**
 * A correct OTP logs into the number's account, creating it first when the
 * number has none (story 26: no sign-up).
 */
export async function verifyOtp(
  deps: { auth: MakamAuth; db: Database; clock: Clock; audit: AuditLog },
  input: { phoneNumber: string; code: string },
): Promise<VerifyOtpResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;

  const [existing] = await deps.db
    .select({ id: identityUser.id })
    .from(identityUser)
    .where(eq(identityUser.phoneNumber, phoneNumber));

  let result;
  try {
    result = await deps.auth.api.verifyPhoneNumber({
      body: { phoneNumber, code: input.code },
      returnHeaders: true,
    });
  } catch (error) {
    // Better Auth lets the verifyOTP hook's error through unchanged.
    if (error instanceof OtpRejected) return error.rejection;
    throw error;
  }

  const { response, headers } = result;
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
