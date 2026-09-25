import { APIError } from "better-auth";
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { OtpRejected, type MakamAuth } from "./better-auth";
import { normalisePhoneNumber } from "./phone-number";
import { identityUser } from "./schema";
import { sessionCookiesFrom, type SessionCookie } from "./sessions";

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
      session: { expiresAt: Date; cookies: SessionCookie[] };
    }
  | { ok: false; reason: string };

/**
 * A correct OTP logs into the number's account, creating it first when the
 * number has none (story 26: no sign-up).
 */
export async function verifyOtp(
  deps: { auth: MakamAuth; db: Database },
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
    if (error instanceof OtpRejected) return { ok: false, reason: error.reason };
    if (error instanceof APIError && error.cause instanceof OtpRejected) {
      return { ok: false, reason: error.cause.reason };
    }
    throw error;
  }

  const { response, headers } = result;
  const context = await deps.auth.$context;
  if (!response.user || !response.token) throw new Error("Better Auth verified the number but made no session");
  const session = await context.internalAdapter.findSession(response.token);
  if (!session) throw new Error("Better Auth reported a session it did not store");

  return {
    ok: true,
    account: { id: response.user.id, phoneNumber },
    accountCreated: !existing,
    session: { expiresAt: session.session.expiresAt, cookies: sessionCookiesFrom(headers) },
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
