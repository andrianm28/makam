/**
 * Identity & Access: accounts keyed by one WhatsApp number, OTP, roles, staff invites, sessions.
 *
 * Owns tables: identity_user, identity_session, identity_auth_account,
 * identity_verification (Better Auth's models), identity_otp_request and
 * identity_staff_role.
 *
 * Every staff write here records an Entri Audit through the Audit Log module,
 * in the same transaction.
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";
import type { Actor, StaffRole } from "./authorize";
import { createBetterAuth, OtpRejected } from "./better-auth";
import { accountByPhoneNumber, verifyOtp, type Account, type VerifyOtpResult } from "./login";
import { inviteStaff, openStaffInvites, type InviteStaffResult, type StaffInvite } from "./invites";
import { moveAccountToNewNumber, type MoveAccountInput, type MoveAccountResult } from "./pindah-nomor";
import { checkCode, requestOtp, type RequestOtpResult } from "./otp";
import { actorFromCookies, endSession } from "./sessions";
import {
  deactivateStaff,
  seedFirstAdminPlatform,
  staffAccounts,
  type DeactivateStaffResult,
  type SeedResult,
  type StaffAccount,
} from "./staff";
import { passTotp, startTotpEnrolment, type PassTotpResult, type StartTotpEnrolmentResult } from "./totp";

export { normalisePhoneNumber, type PhoneNumberResult } from "./phone-number";
export type { CodeRejection, RequestOtpResult } from "./otp";
export { ADMIN_PLATFORM_SESSION_MS, PEMESAN_SESSION_MS, STAFF_SESSION_MS } from "./better-auth";
export type { PassTotpResult, StartTotpEnrolmentResult } from "./totp";
export type { Account, VerifyOtpResult } from "./login";
export type { SessionCookie } from "./sessions";
export type { DeactivateStaffResult, SeedResult, StaffAccount } from "./staff";
export { KTP_CHECK_MAX_BYTES, type MoveAccountInput, type MoveAccountResult } from "./pindah-nomor";
export { staffRoleLabels, type InviteStaffResult, type StaffInvite } from "./invites";
export {
  akunResource,
  auditLogResource,
  authorize,
  stafMenuResource,
  stafResource,
  staffRoles,
  type Action,
  type Actor,
  type Authorization,
  type Resource,
  type Role,
  type StaffRole,
  type TotpStatus,
} from "./authorize";

export interface IdentityDeps {
  db: Database;
  clock: Clock;
  whatsapp: WhatsAppSender;
  /** The private bucket, for the KTP check behind a Pindah Nomor. */
  files: FileStore;
  /** Every staff write records an Entri Audit here. */
  audit: AuditLog;
  /** Signs session cookies and keys the OTP hashes (AUTH_SECRET). */
  secret: string;
  /** Encrypts TOTP secrets at rest (TOTP_ENCRYPTION_KEY): 32 bytes, base64. */
  totpEncryptionKey: string;
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
  /** The CLI seed: the first Admin Platform (number and email). Refused once one exists. */
  seedFirstAdminPlatform(input: { phoneNumber: string; email: string }): Promise<SeedResult>;
  /** Every Akun Staf, with its roles and whether it is Dinonaktifkan. */
  staffAccounts(): Promise<StaffAccount[]>;
  /** Admin Platform sends an Undangan Staf (role, WhatsApp number, required email), audited. */
  inviteStaff(
    by: Actor,
    input: { phoneNumber: string; email: string; role: StaffRole; reason?: string | null },
  ): Promise<InviteStaffResult>;
  /** Admin Platform deactivates an Akun Staf (Dinonaktifkan): sessions end, login blocked, history kept; audited. */
  deactivateStaff(by: Actor, input: { accountId: string; reason: string }): Promise<DeactivateStaffResult>;
  /** Pindah Nomor: Admin Platform moves an Akun to a new number after a KTP check (FileStore), audited. */
  moveAccountToNewNumber(by: Actor, input: MoveAccountInput): Promise<MoveAccountResult>;
  /** Every Undangan Staf not yet accepted and not expired. */
  openStaffInvites(): Promise<StaffInvite[]>;
  /** Starts (or restarts a pending) TOTP enrolment for the signed-in Admin Platform. */
  startTotpEnrolment(cookieHeader: string | null | undefined): Promise<StartTotpEnrolmentResult>;
  /** Checks an authenticator code for the signed-in Admin Platform's session. */
  passTotp(cookieHeader: string | null | undefined, code: string): Promise<PassTotpResult>;
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
    verifyOtp: (input) => verifyOtp({ auth, db: deps.db, clock: deps.clock, audit: deps.audit }, input),
    accountByPhoneNumber: (phoneNumber) => accountByPhoneNumber(deps, phoneNumber),
    actorFromCookies: (cookieHeader) => actorFromCookies(deps, cookieHeader),
    endSession: (cookieHeader) => endSession({ auth, secret: deps.secret }, cookieHeader),
    seedFirstAdminPlatform: (input) => seedFirstAdminPlatform(deps, input),
    staffAccounts: () => staffAccounts(deps),
    inviteStaff: (by, input) => inviteStaff(deps, by, input),
    openStaffInvites: () => openStaffInvites(deps),
    deactivateStaff: (by, input) => deactivateStaff(deps, by, input),
    moveAccountToNewNumber: (by, input) => moveAccountToNewNumber(deps, by, input),
    startTotpEnrolment: (cookieHeader) => startTotpEnrolment(deps, cookieHeader),
    passTotp: (cookieHeader, code) => passTotp(deps, cookieHeader, code),
  };
}
