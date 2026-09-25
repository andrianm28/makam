/**
 * Identity & Access: accounts keyed by one WhatsApp number, OTP, roles, staff invites, sessions.
 *
 * Owns tables: identity_user, identity_session, identity_auth_account,
 * identity_verification (Better Auth's models) and identity_otp_request.
 */
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";
import type { Actor } from "./authorize";
import { createBetterAuth, OtpRejected } from "./better-auth";
import { accountByPhoneNumber, verifyOtp, type Account, type VerifyOtpResult } from "./login";
import { checkCode, requestOtp, type RequestOtpResult } from "./otp";
import { actorFromCookies, endSession } from "./sessions";

export { normalisePhoneNumber, type PhoneNumberResult } from "./phone-number";
export type { CodeRejection, RequestOtpResult } from "./otp";
export { PEMESAN_SESSION_MS } from "./better-auth";
export type { Account, VerifyOtpResult } from "./login";
export type { SessionCookie } from "./sessions";
export {
  akunResource,
  authorize,
  type Action,
  type Actor,
  type Authorization,
  type Resource,
  type Role,
} from "./authorize";

export interface IdentityDeps {
  db: Database;
  clock: Clock;
  whatsapp: WhatsAppSender;
  /** Signs session cookies and keys the OTP hashes (AUTH_SECRET). */
  secret: string;
  /** The site's own origin, e.g. https://makam.co.id. */
  baseURL: string;
}

export interface Identity {
  /** Sends a login OTP to a WhatsApp number (Masuk, and Kirim in the wizards). */
  requestOtp(input: { phoneNumber: string }): Promise<RequestOtpResult>;
  /** Logs in with the OTP, creating the number's account when it has none. */
  verifyOtp(input: { phoneNumber: string; code: string }): Promise<VerifyOtpResult>;
  /** The account keyed by this WhatsApp number (any spelling), or null. */
  accountByPhoneNumber(phoneNumber: string): Promise<Account | null>;
  /** The signed-in actor for a request's Cookie header, or null when not signed in. */
  actorFromCookies(cookieHeader: string | null | undefined): Promise<Actor | null>;
  /** Keluar: ends the session behind the Cookie header and names the cookies to clear. */
  endSession(cookieHeader: string | null | undefined): Promise<{ clearCookies: string[] }>;
}

export function createIdentity(deps: IdentityDeps): Identity {
  const auth = createBetterAuth({
    db: deps.db,
    clock: deps.clock,
    secret: deps.secret,
    baseURL: deps.baseURL,
    async verifyCode(phoneNumber, code) {
      const checked = await checkCode(deps, { phoneNumber, code });
      if (!checked.ok) throw new OtpRejected(checked);
    },
  });

  return {
    requestOtp: (input) => requestOtp(deps, input),
    verifyOtp: (input) => verifyOtp({ auth, db: deps.db }, input),
    accountByPhoneNumber: (phoneNumber) => accountByPhoneNumber(deps, phoneNumber),
    actorFromCookies: (cookieHeader) => actorFromCookies({ auth, clock: deps.clock, secret: deps.secret }, cookieHeader),
    endSession: (cookieHeader) => endSession({ auth, secret: deps.secret }, cookieHeader),
  };
}
