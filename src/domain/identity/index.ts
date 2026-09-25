/**
 * Identity & Access: accounts keyed by one WhatsApp number, OTP, roles, staff invites, sessions.
 *
 * Owns tables: identity_otp_request.
 */
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";
import { requestOtp, type RequestOtpResult } from "./otp";

export { normalisePhoneNumber, type PhoneNumberResult } from "./phone-number";
export { OTP_EXPIRES_AFTER_MS, OTP_LENGTH, type RequestOtpResult } from "./otp";

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
}

export function createIdentity(deps: IdentityDeps): Identity {
  return {
    requestOtp: (input) => requestOtp(deps, input),
  };
}
