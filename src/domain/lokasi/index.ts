/**
 * Lokasi: Lokasi Mitra and TPU, Jam Operasional, Kontak Siaga, publish gate, working-time calculator.
 *
 * Owns table: lokasi_mitra (the onboarding record).
 *
 * Every write is a staff write: it records an Entri Audit through the Audit
 * Log module in the same transaction, and re-checks `authorize` itself.
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Actor, Identity } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import {
  adminLokasiOfLokasi,
  inviteAdminLokasi,
  removeAdminLokasiFromLokasi,
  type AdminLokasiOfResult,
  type InviteAdminLokasiResult,
  type RemoveAdminLokasiFromLokasiResult,
} from "./admin-lokasi";
import {
  allLokasiMitra,
  changeBankAccount,
  createLokasiMitra,
  isTerverifikasi,
  lokasiMitraOfAdminLokasi,
  readLokasiMitra,
  setDocumentChecklist,
  setPoliciesAndFlags,
  updateProfile,
  type UpdateProfileResult,
  type BankAccount,
  type ChangeBankAccountResult,
  type CreateLokasiMitraResult,
  type LokasiMitraResult,
  type LokasiMitraSummary,
  type NewLokasiMitra,
  type NotFound,
  type SetPoliciesResult,
  type WriteResult,
} from "./lokasi-mitra";
import type { LokasiFlags, LokasiPolicies } from "./policies";
import type { LokasiProfileInput } from "./profile";
import { fullLokasiAuditLog, lokasiAuditLog, type LokasiAuditLogResult } from "./audit-view";
import {
  agreementScanUrl,
  uploadAgreement,
  type AgreementScanUrlResult,
  type UploadAgreementResult,
} from "./agreement";
import {
  readJamOperasional,
  jamOperasionalOf,
  setJamOperasional,
  type JamOperasionalResult,
  type SetJamOperasionalResult,
} from "./jam-operasional";
import {
  kontakSiagaOf,
  pickKontakSiaga,
  readKontakSiaga,
  type KontakSiaga,
  type KontakSiagaResult,
  type PickKontakSiagaResult,
} from "./kontak-siaga";
import type { JamOperasional, Tanggal } from "./jam-operasional-schema";
import type { HariLiburNasional } from "./working-time";
import {
  addHariLiburNasional,
  hariLiburNasional,
  readAdminPlatformCalendar,
  removeHariLiburNasional,
  type AddHariLiburNasionalResult,
  type RemoveHariLiburNasionalResult,
} from "./calendars";

export {
  AGREEMENT_SCAN_MAX_BYTES,
  AGREEMENT_SCAN_URL_SECONDS,
  type AgreementScanUrlResult,
  type UploadAgreementResult,
} from "./agreement";
export type { LokasiAuditLogResult } from "./audit-view";
export type { JamOperasionalResult, SetJamOperasionalResult } from "./jam-operasional";
export {
  MAX_TANGGAL_TUTUP,
  jamMenitSchema,
  jamOperasionalSchema,
  tanggalSchema,
  tanggalTutupSchema,
  weekdays,
  type JamMenit,
  type JamOperasional,
  type OpenHours,
  type Tanggal,
  type TanggalTutup,
  type Weekday,
} from "./jam-operasional-schema";
export type { KontakSiaga, KontakSiagaResult, PickKontakSiagaResult } from "./kontak-siaga";
export { hariLiburNasionalSchema, type AddHariLiburNasionalResult, type RemoveHariLiburNasionalResult } from "./calendars";
export type { AdminLokasiOfResult, InviteAdminLokasiResult, RemoveAdminLokasiFromLokasiResult } from "./admin-lokasi";
export { DEFAULT_DOCUMENT_CHECKLIST } from "./lokasi-mitra";
export {
  DEFAULT_FLAGS,
  DEFAULT_POLICIES,
  lokasiFlagsSchema,
  lokasiPoliciesSchema,
  type LokasiFlags,
  type LokasiPolicies,
} from "./policies";
/** Every Lokasi Mitra status: Belum Tayang (set here), Terverifikasi (publish gate, ticket 16), Ditangguhkan and Berhenti (ticket 59). */
export { lokasiMitraStatuses as LOKASI_MITRA_STATUSES } from "./schema";
export {
  lokasiFacilities,
  lokasiProfileSchema,
  type LokasiFacility,
  type LokasiProfile,
  type LokasiProfileInput,
} from "./profile";
export type {
  UpdateProfileResult,
  BankAccount,
  ChangeBankAccountResult,
  SetPoliciesResult,
  CreateLokasiMitraResult,
  LokasiMitra,
  LokasiMitraResult,
  LokasiMitraStatus,
  LokasiMitraSummary,
  NewLokasiMitra,
  WriteResult,
} from "./lokasi-mitra";

export interface LokasiModuleDeps {
  db: Database;
  clock: Clock;
  /** The private bucket, for agreement scans. */
  files: FileStore;
  /** Every write records an Entri Audit here. */
  audit: AuditLog;
  /** Admin Lokasi invites and links go through the identity module. */
  identity: Identity;
}

export interface Lokasi {
  /** Admin Platform starts a Lokasi Mitra's onboarding record (Belum Tayang), audited. */
  createLokasiMitra(by: Actor, input: NewLokasiMitra): Promise<CreateLokasiMitraResult>;
  /** Whether this Lokasi Mitra is Terverifikasi (listed); no actor, for public reads. False for an unknown id. */
  isTerverifikasi(lokasiId: string): Promise<boolean>;
  /** One Lokasi Mitra's record, for Admin Platform or one of its Admin Lokasi. */
  lokasiMitra(by: Actor, lokasiId: string): Promise<LokasiMitraResult>;
  /** Admin Platform records the profile (name, pengelola, address, city, pin, facilities), audited. */
  updateProfile(by: Actor, lokasiId: string, input: LokasiProfileInput): Promise<UpdateProfileResult>;
  /** Admin Platform replaces the document checklist, audited. */
  setDocumentChecklist(by: Actor, lokasiId: string, input: { documentChecklist: string[] }): Promise<WriteResult>;
  /** Admin Platform sets the policies and flags together, audited; values outside the rules are refused. */
  setPoliciesAndFlags(
    by: Actor,
    lokasiId: string,
    input: { policies: LokasiPolicies; flags: LokasiFlags },
  ): Promise<SetPoliciesResult>;
  /** Admin Platform (only) sets or changes the bank account, audited. */
  changeBankAccount(
    by: Actor,
    lokasiId: string,
    input: BankAccount & { reason: string | null },
  ): Promise<ChangeBankAccountResult>;
  /** Admin Platform (only) invites an Admin Lokasi to this Lokasi Mitra by WhatsApp number and required email, audited. */
  inviteAdminLokasi(
    by: Actor,
    lokasiId: string,
    input: { phoneNumber: string; email: string; reason?: string | null },
  ): Promise<InviteAdminLokasiResult>;
  /** The Admin Lokasi of this Lokasi Mitra and the open invites to it. */
  adminLokasiOf(by: Actor, lokasiId: string): Promise<AdminLokasiOfResult>;
  /** Admin Platform (only) removes an Admin Lokasi from this Lokasi Mitra, with a reason, audited. */
  removeAdminLokasi(
    by: Actor,
    lokasiId: string,
    input: { accountId: string; reason: string },
  ): Promise<RemoveAdminLokasiFromLokasiResult>;
  /** Every Lokasi Mitra, by name (Admin Platform; empty for anyone else). */
  allLokasiMitra(by: Actor): Promise<LokasiMitraSummary[]>;
  /** The Lokasi Mitra the actor is Admin Lokasi of, by name: the Lokasi switcher. */
  lokasiMitraOfAdminLokasi(by: Actor): Promise<LokasiMitraSummary[]>;
  /**
   * This Lokasi Mitra's Audit Log for its Admin Lokasi (and Admin Platform), without Catatan Internal and Antrean
   * claims; bank account numbers masked to their last 4 digits and no agreement scan file keys.
   */
  auditLog(by: Actor, lokasiId: string): Promise<LokasiAuditLogResult>;
  /** This Lokasi Mitra's whole Audit Log, unfiltered and unmasked (Admin Platform only). */
  fullAuditLog(by: Actor, lokasiId: string): Promise<LokasiAuditLogResult>;
  /** Admin Platform uploads the agreement scan (FileStore) with its signing date, audited. */
  uploadAgreement(
    by: Actor,
    lokasiId: string,
    input: { scan: { body: Uint8Array; contentType: string }; signedOn: string },
  ): Promise<UploadAgreementResult>;
  /** A 5-minute signed URL to the agreement scan, for Admin Platform only. */
  agreementScanUrl(by: Actor, lokasiId: string): Promise<AgreementScanUrlResult>;
  /** This Lokasi Mitra's Jam Operasional (null until its Admin Lokasi saves one), for Admin Platform or one of its Admin Lokasi. */
  jamOperasional(by: Actor, lokasiId: string): Promise<JamOperasionalResult>;
  /** Its Admin Lokasi (or Admin Platform) sets the Jam Operasional: weekly hours and Tanggal Tutup, audited. */
  setJamOperasional(by: Actor, lokasiId: string, input: JamOperasional): Promise<SetJamOperasionalResult>;
  /** This Lokasi Mitra's Kontak Siaga (null until picked, or after its Admin Lokasi was removed), for Admin Platform or its Admin Lokasi. */
  kontakSiaga(by: Actor, lokasiId: string): Promise<KontakSiagaResult>;
  /** Its Admin Lokasi (or Admin Platform) picks the Kontak Siaga from the Lokasi's Admin Lokasi, audited. */
  pickKontakSiaga(by: Actor, lokasiId: string, input: { accountId: string }): Promise<PickKontakSiagaResult>;
  /** The Kontak Siaga for server code (alerts, the order card): null when a pick is needed. */
  kontakSiagaOf(lokasiId: string): Promise<KontakSiaga | null>;
  /** The Hari Libur Nasional list Admin Platform keeps, by date. */
  hariLiburNasional(): Promise<HariLiburNasional[]>;
  /** Admin Platform (only) adds a Hari Libur Nasional, audited. */
  addHariLiburNasional(by: Actor, input: HariLiburNasional): Promise<AddHariLiburNasionalResult>;
  /** Admin Platform (only) removes a Hari Libur Nasional, audited. */
  removeHariLiburNasional(by: Actor, input: { date: Tanggal; reason: string | null }): Promise<RemoveHariLiburNasionalResult>;
  /**
   * The Admin Platform Hari Kerja calendar, as a Jam Operasional: Monday–Friday (ending 23:59 WIB), each Hari
   * Libur Nasional on the list a Tanggal Tutup. It reads the list on every call, so fetch it once per tick.
   */
  adminPlatformCalendar(): Promise<JamOperasional>;
  /**
   * A Lokasi Mitra's Jam Operasional (also its Hari Kerja calendar), for server code: null until its Admin Lokasi
   * saves one, which every calculator function refuses (`jam_operasional_belum_diisi`).
   */
  jamOperasionalOf(lokasiId: string): Promise<{ ok: true; jamOperasional: JamOperasional | null } | NotFound>;
}

export function createLokasi(deps: LokasiModuleDeps): Lokasi {
  return {
    createLokasiMitra: (by, input) => createLokasiMitra(deps, by, input),
    isTerverifikasi: (lokasiId) => isTerverifikasi(deps, lokasiId),
    lokasiMitra: (by, lokasiId) => readLokasiMitra(deps, by, lokasiId),
    updateProfile: (by, lokasiId, input) => updateProfile(deps, by, lokasiId, input),
    setDocumentChecklist: (by, lokasiId, input) => setDocumentChecklist(deps, by, lokasiId, input),
    setPoliciesAndFlags: (by, lokasiId, input) => setPoliciesAndFlags(deps, by, lokasiId, input),
    changeBankAccount: (by, lokasiId, input) => changeBankAccount(deps, by, lokasiId, input),
    inviteAdminLokasi: (by, lokasiId, input) => inviteAdminLokasi(deps, by, lokasiId, input),
    adminLokasiOf: (by, lokasiId) => adminLokasiOfLokasi(deps, by, lokasiId),
    removeAdminLokasi: (by, lokasiId, input) => removeAdminLokasiFromLokasi(deps, by, lokasiId, input),
    allLokasiMitra: (by) => allLokasiMitra(deps, by),
    lokasiMitraOfAdminLokasi: (by) => lokasiMitraOfAdminLokasi(deps, by),
    auditLog: (by, lokasiId) => lokasiAuditLog(deps, by, lokasiId),
    fullAuditLog: (by, lokasiId) => fullLokasiAuditLog(deps, by, lokasiId),
    uploadAgreement: (by, lokasiId, input) => uploadAgreement(deps, by, lokasiId, input),
    agreementScanUrl: (by, lokasiId) => agreementScanUrl(deps, by, lokasiId),
    jamOperasional: (by, lokasiId) => readJamOperasional(deps, by, lokasiId),
    setJamOperasional: (by, lokasiId, input) => setJamOperasional(deps, by, lokasiId, input),
    kontakSiaga: (by, lokasiId) => readKontakSiaga(deps, by, lokasiId),
    pickKontakSiaga: (by, lokasiId, input) => pickKontakSiaga(deps, by, lokasiId, input),
    kontakSiagaOf: (lokasiId) => kontakSiagaOf(deps, lokasiId),
    hariLiburNasional: () => hariLiburNasional(deps),
    addHariLiburNasional: (by, input) => addHariLiburNasional(deps, by, input),
    removeHariLiburNasional: (by, input) => removeHariLiburNasional(deps, by, input),
    adminPlatformCalendar: () => readAdminPlatformCalendar(deps),
    jamOperasionalOf: (lokasiId) => jamOperasionalOf(deps, lokasiId),
  };
}
export {
  addWorkingDays,
  adminPlatformCalendar,
  daytimeHoursDeadline,
  deadline,
  nextWorkingDayEnd,
  TPU_SCHEDULE,
  type HariLiburNasional,
} from "./working-time";
