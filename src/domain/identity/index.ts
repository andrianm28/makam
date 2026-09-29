/**
 * Identity & Access: Akun keyed by one Email Terverifikasi (ADR 0004), the
 * Kode Masuk, roles, Undangan Staf, sessions, TOTP and Pemulihan Akun.
 *
 * Owns tables: identity_user, identity_session, identity_auth_account,
 * identity_verification (Better Auth's models), identity_otp_request,
 * identity_ip_request, identity_staff_role, identity_staff_invite and identity_totp.
 *
 * Every staff write here records an Entri Audit through the Audit Log module,
 * in the same transaction.
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import type { FileStore } from "@/ports/file-store";
import { akunOfVerifiedEmail, type Account } from "./akun-lookup";
import type { Actor } from "./authorize";
import { createBetterAuth } from "./better-auth";
import {
  confirmEmailVerification,
  requestEmailVerification,
  updatePhoneNumber,
  type ConfirmEmailVerificationResult,
  type RequestEmailVerificationResult,
  type UpdatePhoneNumberResult,
} from "./email";
import { normaliseEmail } from "./email-address";
import { inviteStaff, openStaffInvites, type InviteStaffInput, type InviteStaffResult, type StaffInvite } from "./invites";
import {
  requestKodeMasuk,
  verifyKodeMasuk,
  type RequestKodeMasukResult,
  type VerifyKodeMasukResult,
} from "./kode-masuk";
import { markEmailVerifiedByOps, type MarkEmailVerifiedByOpsResult } from "./ops-email-verification";
import {
  accountOnRecord,
  recoverAccount,
  type AccountOnRecord,
  type RecoverAccountInput,
  type RecoverAccountResult,
} from "./pemulihan-akun";
import { actorFromCookies, endSession } from "./sessions";
import {
  deactivateStaff,
  seedFirstAdminPlatform,
  staffAccountById,
  staffAccounts,
  staffRecipient,
  adminLokasiOf,
  adminLokasiSince,
  removeAdminLokasi,
  type RemoveAdminLokasiResult,
  type AdminLokasiAccount,
  type DeactivateStaffResult,
  type SeedResult,
  type StaffAccount,
  type StaffRecipient,
} from "./staff";
import {
  passTotp,
  resetTotp,
  startTotpEnrolment,
  type PassTotpResult,
  type ResetTotpResult,
  type StartTotpEnrolmentResult,
} from "./totp";

export { normalisePhoneNumber, type PhoneNumberRejection, type PhoneNumberResult } from "./phone-number";
export { normaliseEmail } from "./email-address";
export { pruneIpRequests, type CodeRejection } from "./otp";
export { ADMIN_PLATFORM_SESSION_MS, PEMESAN_SESSION_MS, STAFF_SESSION_MS } from "./better-auth";
export type { Account } from "./akun-lookup";
export type { RequestKodeMasukResult, VerifyKodeMasukResult } from "./kode-masuk";
export type { PassTotpResult, ResetTotpResult, StartTotpEnrolmentResult } from "./totp";
export type { MarkEmailVerifiedByOpsResult } from "./ops-email-verification";
export type { ConfirmEmailVerificationResult, RequestEmailVerificationResult, UpdatePhoneNumberResult } from "./email";
export type { SessionCookie } from "./sessions";
export type {
  AdminLokasiAccount,
  DeactivateStaffResult,
  RemoveAdminLokasiResult,
  SeedResult,
  StaffAccount,
  StaffRecipient,
} from "./staff";
export {
  KTP_CHECK_MAX_BYTES,
  type AccountOnRecord,
  type RecoverAccountInput,
  type RecoverAccountResult,
} from "./pemulihan-akun";
export type { InviteStaffInput, InviteStaffResult, StaffInvite } from "./invites";
export {
  akunResource,
  antreanResource,
  auditLogLokasiResource,
  auditLogResource,
  authorize,
  hariLiburNasionalResource,
  layananKatalogResource,
  lokasiMitraResource,
  mitraJasaResource,
  pekerjaanTpuSemuaResource,
  pemesananResource,
  pencairanResource,
  pengembalianResource,
  pengurusanTpuResource,
  pesananLayananResource,
  semuaLokasiMitraResource,
  setorRetribusiResource,
  tagihanResource,
  semuaMitraJasaResource,
  needsTotp,
  pengaturanOperatorResource,
  stafMenuResource,
  stafResource,
  staffRoles,
  semuaTugasLapanganResource,
  semuaTpuDkiResource,
  tarifGlobalResource,
  tpuDkiResource,
  tugasLapanganResource,
  type Action,
  type Actor,
  type Authorization,
  type Resource,
  type Role,
  type StaffRole,
  writeRefusal,
  type TotpStatus,
  type WriteRefusal,
} from "./authorize";

export interface IdentityDeps {
  db: Database;
  clock: Clock;
  /** Sends the Kode Masuk, the Verifikasi Email code and the Undangan Staf (directly, not through Notifications). */
  email: EmailSender;
  /** The private bucket, for the KTP check behind a Pemulihan Akun. */
  files: FileStore;
  /** Every staff write records an Entri Audit here. */
  audit: AuditLog;
  /** Signs session cookies and keys the code hashes (AUTH_SECRET). */
  secret: string;
  /** Encrypts TOTP secrets at rest (TOTP_ENCRYPTION_KEY): 32 bytes, base64. */
  totpEncryptionKey: string;
  /** The site's own origin, e.g. https://makam.co.id. */
  baseURL: string;
  /**
   * Reports a failure worth an operator's eye (an email the EmailSender
   * refused). Gets no address and no code. Default: the event and the
   * error's name on stderr.
   */
  reportError?: (event: string, error: unknown) => void;
}

function reportToStderr(event: string, error: unknown): void {
  // The name only: an SMTP error message may quote the recipient.
  console.error(`[identity] ${event}: ${error instanceof Error ? error.name : typeof error}`);
}

export interface Identity {
  /**
   * Sends a Kode Masuk to an email (Masuk, and Kirim in the wizards). The
   * reply is the same for every email, whether an Akun has it or not.
   */
  requestKodeMasuk(input: { email: string; ip: string }): Promise<RequestKodeMasukResult>;
  /**
   * Logs in with the Kode Masuk: into the Akun of that Email Terverifikasi,
   * created when the email has none. A wizard's Kirim passes the `name` it asked
   * for, which fills an Akun that has no name yet.
   */
  verifyKodeMasuk(input: { email: string; code: string; name?: string }): Promise<VerifyKodeMasukResult>;
  /** The Akun whose Email Terverifikasi this is (any case), or null. */
  accountByEmail(email: string): Promise<Account | null>;
  /** The signed-in actor for a request's Cookie header, or null when not signed in. */
  actorFromCookies(cookieHeader: string | null | undefined): Promise<Actor | null>;
  /** Keluar: ends the session behind the Cookie header and names the cookies to clear. */
  endSession(cookieHeader: string | null | undefined): Promise<{ clearCookies: string[] }>;
  /**
   * The CLI seed: the first Admin Platform, its email seeded as its Email
   * Terverifikasi, with a contact phone number. Refused once one exists.
   */
  seedFirstAdminPlatform(input: { email: string; phoneNumber: string }): Promise<SeedResult>;
  /** Every Akun Staf, with its roles and whether it is Dinonaktifkan. */
  staffAccounts(): Promise<StaffAccount[]>;
  /**
   * One Akun Staf by its id, or null. The narrow read behind a family's own page
   * naming the staff member who took their order: a name and a contact number.
   */
  staffAccountById(accountId: string): Promise<StaffAccount | null>;
  /**
   * The Akun Staf a Peringatan Staf goes to: its Email Terverifikasi and live
   * sessions. Null when it holds no staff role (never invited, or Dinonaktifkan).
   */
  staffRecipient(accountId: string): Promise<StaffRecipient | null>;
  /**
   * Admin Platform sends an Undangan Staf (role, email, contact phone number;
   * for Admin Lokasi also the Lokasi Mitra) by email, audited. Admin Lokasi
   * invites go through the Lokasi module's `inviteAdminLokasi`, which checks the Lokasi.
   */
  inviteStaff(by: Actor, input: InviteStaffInput): Promise<InviteStaffResult>;
  /** Every Admin Lokasi of one Lokasi Mitra. */
  adminLokasiOf(lokasiId: string): Promise<AdminLokasiAccount[]>;
  /** The Akun if it has been Admin Lokasi of this Lokasi Mitra without a break since `since` (not removed, not Dinonaktifkan), else null. */
  adminLokasiSince(accountId: string, lokasiId: string, since: Date): Promise<AdminLokasiAccount | null>;
  /** Admin Platform removes an Admin Lokasi from one Lokasi Mitra (the Akun keeps its other Lokasi), audited. */
  removeAdminLokasi(
    by: Actor,
    input: { lokasiId: string; accountId: string; reason: string },
  ): Promise<RemoveAdminLokasiResult>;
  /** Admin Platform deactivates an Akun Staf (Dinonaktifkan): sessions end, login blocked, history kept; audited. */
  deactivateStaff(by: Actor, input: { accountId: string; reason: string }): Promise<DeactivateStaffResult>;
  /** Pemulihan Akun: Admin Platform moves an Akun to a new Email Terverifikasi after a KTP check (FileStore), audited. */
  recoverAccount(by: Actor, input: RecoverAccountInput): Promise<RecoverAccountResult>;
  /** An Akun as its records hold it, by id (the Pemulihan Akun screen; Admin Platform pages only), or null. */
  accountOnRecord(accountId: string): Promise<AccountOnRecord | null>;
  /** Every Undangan Staf not yet accepted and not expired; with `lokasiId`, the Admin Lokasi invites to that Lokasi Mitra. */
  openStaffInvites(filter?: { lokasiId?: string }): Promise<StaffInvite[]>;
  /** Starts (or restarts a pending) TOTP enrolment for the signed-in Admin Platform (the guarded actor). */
  startTotpEnrolment(by: Actor): Promise<StartTotpEnrolmentResult>;
  /** Checks an authenticator code for the signed-in Admin Platform's session (the guarded actor's). */
  passTotp(by: Actor, code: string): Promise<PassTotpResult>;
  /** Ops (`reset-totp` CLI): clears an Admin Platform's TOTP enrolment and ends its sessions; audited as ops_cli. */
  resetTotp(input: { email: string; reason: string }): Promise<ResetTotpResult>;
  /** Akun Saya: the Akun's phone number, a contact (+62, never verified); audited for an Akun Staf. */
  updatePhoneNumber(by: Actor, input: { phoneNumber: string }): Promise<UpdatePhoneNumberResult>;
  /** Verifikasi Email, step 1: sends a code to the email typed; nothing changes on the Akun yet. */
  requestEmailVerification(by: Actor, input: { email: string; ip: string }): Promise<RequestEmailVerificationResult>;
  /** Verifikasi Email, step 2: the code makes its email the Akun's Email Terverifikasi (its key). */
  confirmEmailVerification(by: Actor, input: { code: string }): Promise<ConfirmEmailVerificationResult>;
  /**
   * Ops (`verify-email` CLI): makes the email on record of an Admin Platform
   * from before ADR 0004 its Email Terverifikasi, audited as ops_cli with the reason.
   */
  markEmailVerifiedByOps(input: { email: string; reason: string }): Promise<MarkEmailVerifiedByOpsResult>;
}

export function createIdentity(deps: IdentityDeps): Identity {
  const auth = createBetterAuth({ db: deps.db, clock: deps.clock, secret: deps.secret, baseURL: deps.baseURL });
  const reportError = deps.reportError ?? reportToStderr;
  const reporting = { ...deps, reportError };
  const kodeMasuk = { ...reporting, auth };

  return {
    requestKodeMasuk: (input) => requestKodeMasuk(kodeMasuk, input),
    verifyKodeMasuk: (input) => verifyKodeMasuk(kodeMasuk, input),
    accountByEmail: async (email) => {
      const normalised = normaliseEmail(email);
      return normalised ? akunOfVerifiedEmail(deps.db, normalised) : null;
    },
    actorFromCookies: (cookieHeader) => actorFromCookies(deps, cookieHeader),
    endSession: (cookieHeader) => endSession({ auth, secret: deps.secret }, cookieHeader),
    seedFirstAdminPlatform: (input) => seedFirstAdminPlatform(deps, input),
    staffAccounts: () => staffAccounts(deps),
    staffAccountById: (accountId) => staffAccountById(deps, accountId),
    staffRecipient: (accountId) => staffRecipient(deps, accountId),
    inviteStaff: (by, input) => inviteStaff(reporting, by, input),
    adminLokasiOf: (lokasiId) => adminLokasiOf(deps, lokasiId),
    adminLokasiSince: (accountId, lokasiId, since) => adminLokasiSince(deps, accountId, lokasiId, since),
    removeAdminLokasi: (by, input) => removeAdminLokasi(deps, by, input),
    openStaffInvites: (filter) => openStaffInvites(deps, filter),
    deactivateStaff: (by, input) => deactivateStaff(deps, by, input),
    recoverAccount: (by, input) => recoverAccount(reporting, by, input),
    accountOnRecord: (accountId) => accountOnRecord(deps, accountId),
    startTotpEnrolment: (by) => startTotpEnrolment(deps, by),
    passTotp: (by, code) => passTotp(deps, by, code),
    resetTotp: (input) => resetTotp(deps, input),
    updatePhoneNumber: (by, input) => updatePhoneNumber(deps, by, input),
    requestEmailVerification: (by, input) => requestEmailVerification(reporting, by, input),
    confirmEmailVerification: (by, input) => confirmEmailVerification(reporting, by, input),
    markEmailVerifiedByOps: (input) => markEmailVerifiedByOps(deps, input),
  };
}
