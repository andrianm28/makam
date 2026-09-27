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
  lokasiMitraCountsByStatus,
  readLokasiMitra,
  setDocumentChecklist,
  setPoliciesAndFlags,
  updateProfile,
  type UpdateProfileResult,
  type BankAccount,
  type ChangeBankAccountResult,
  type CreateLokasiMitraResult,
  type LokasiMitraResult,
  type LokasiMitraStatus,
  type LokasiMitraSummary,
  type NewLokasiMitra,
  type NotFound,
  type SetPoliciesResult,
  type WriteResult,
} from "./lokasi-mitra";
import { searchLokasiMitra, type LokasiMitraListPage, type LokasiMitraListQuery } from "./lokasi-list";
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
  bukaSekarang,
  documentChecklistOf,
  saatDukaPaymentWindowHours,
  serviceHoursDeadline,
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
import type { HariLiburNasional, WorkingTimeResult } from "./working-time";
import {
  addHariLiburNasional,
  hariLiburNasional,
  nextHariLiburNasional,
  readAdminPlatformCalendar,
  removeHariLiburNasional,
  type AddHariLiburNasionalResult,
  type RemoveHariLiburNasionalResult,
} from "./calendars";
import {
  cekDenahOf,
  kunjunganVerifikasiSelesai,
  recordCekDenah,
  recordKunjunganVerifikasi,
  type CekDenahRecord,
  type KunjunganVerifikasiInput,
  type RecordCekDenahResult,
  type RecordKunjunganVerifikasiResult,
} from "./kunjungan";
import {
  publishLokasiMitra,
  recordPublishGateMasihTerpenuhi,
  type PublishInput,
  type PublishLokasiMitraResult,
} from "./publish";
import { activateTerencana, type ActivateTerencanaInput, type ActivateTerencanaResult } from "./terencana";
import {
  createTpuDki,
  publicTpuDki,
  publicTpuDkiList,
  tpuDkiList,
  updateTpuDki,
  updateTpuDkiFlag,
  type CreateTpuDkiResult,
  type NewTpuDki,
  type PublicTpuDki,
  type PublicTpuDkiQuery,
  type TpuDki,
  type TpuProfileInput,
  type UpdateTpuDkiFlagResult,
  type UpdateTpuDkiResult,
} from "./tpu";
import {
  publicLokasiMitra,
  publicLokasiMitraCities,
  publicLokasiMitraList,
  publicLokasiMakamCities,
  publicLokasiMakamList,
  publicVisitPhotoUrls,
  type LokasiMakamCard,
  type LokasiMakamQuery,
  type PublicLokasiMitra,
  type PublicLokasiMitraCard,
  type PublicLokasiMitraQuery,
} from "./public-reads";

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
export {
  HARI_LIBUR_NASIONAL_NAME_MAX,
  hariLiburNasionalSchema,
  hapusHariLiburSchema,
  type AddHariLiburNasionalResult,
  type HariLiburNasionalInput,
  type HapusHariLiburInput,
  type RemoveHariLiburNasionalResult,
} from "./calendars";
export type { AdminLokasiOfResult, InviteAdminLokasiResult, RemoveAdminLokasiFromLokasiResult } from "./admin-lokasi";
export { DEFAULT_DOCUMENT_CHECKLIST } from "./lokasi-mitra";
export {
  publishGate,
  type PublishGate,
  type PublishGateFacts,
  type PublishGateItem,
  type PublishGateKey,
} from "./publish-gate";
export {
  LOKASI_LIST_DEFAULT_PAGE_SIZE,
  LOKASI_LIST_MAX_PAGE_SIZE,
  type LokasiMitraListPage,
  type LokasiMitraListQuery,
  type LokasiMitraListRow,
} from "./lokasi-list";
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
export type {
  CekDenahRecord,
  KunjunganVerifikasiInput,
  RecordCekDenahResult,
  RecordKunjunganVerifikasiResult,
} from "./kunjungan";
export type { PublishInput, PublishLokasiMitraResult } from "./publish";
export {
  TPU_LIMITS,
  type CreateTpuDkiResult,
  type NewTpuDki,
  type PublicTpuDki,
  type PublicTpuDkiQuery,
  type TpuDki,
  type TpuProfileInput,
  type UpdateTpuDkiFlagResult,
  type UpdateTpuDkiResult,
} from "./tpu";
export {
  terencanaSwitchGate,
  type ActivateTerencanaInput,
  type ActivateTerencanaResult,
  type TerencanaSwitchGate,
  type TerencanaSwitchKey,
} from "./terencana";
export type { PublicLokasiMitra, PublicLokasiMitraCard, PublicLokasiMitraQuery } from "./public-reads";
export type { LokasiMakamCard, LokasiMakamKind, LokasiMakamQuery } from "./public-reads";

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
  /** Admin Platform (only) invites an Admin Lokasi to this Lokasi Mitra by email (phone number as contact), audited. */
  inviteAdminLokasi(
    by: Actor,
    lokasiId: string,
    input: { email: string; phoneNumber: string; reason?: string | null },
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
  /**
   * One page of the Lokasi Mitra list, by name (Admin Platform; an empty page for anyone else): searched by a part of
   * the name, kota / kabupaten or pengelola, filtered by status.
   */
  searchLokasiMitra(by: Actor, query: LokasiMitraListQuery): Promise<LokasiMitraListPage>;
  /** The Lokasi Mitra the actor is Admin Lokasi of, by name: the Lokasi switcher. */
  lokasiMitraOfAdminLokasi(by: Actor): Promise<LokasiMitraSummary[]>;
  /** How many Lokasi Mitra are in each status (Admin Platform; all zero for anyone else). */
  lokasiMitraCountsByStatus(by: Actor): Promise<Record<LokasiMitraStatus, number>>;
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
  /** The first Hari Libur Nasional from today (WIB, on the Clock), today included; null when none is ahead. */
  nextHariLiburNasional(): Promise<HariLiburNasional | null>;
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
  /**
   * `hours` service hours in the Lokasi's saved Jam Operasional from `start`, or from now (the Clock) when none is
   * given, e.g. the Saat Duka confirmation deadline; refused while its Jam Operasional is belum diisi.
   */
  serviceHoursDeadline(lokasiId: string, hours: number, start?: Date): Promise<WorkingTimeResult | NotFound>;
  /**
   * A Lokasi Mitra's Saat Duka payment window in hours (its own policy, 72 by
   * default): what a confirmed order's pay-after Tagihan is due after the
   * burial (ticket 23). No actor; null for a Lokasi Mitra that does not exist.
   */
  saatDukaPaymentWindowHours(lokasiId: string): Promise<number | null>;
  /**
   * A Lokasi Mitra's document checklist, whatever its status (ticket 23): what
   * a family is asked to bring and what an Admin Lokasi ticks off. No actor.
   */
  documentChecklistOf(lokasiId: string): Promise<string[]>;
  /**
   * Whether this Lokasi Mitra is inside its Jam Operasional at the Clock's now
   * (the order card's own fact, no actor); false for a Jam Operasional belum diisi.
   */
  bukaSekarang(lokasiId: string): Promise<{ ok: true; buka: boolean } | NotFound>;
  /**
   * The fieldwork module calls this once a Kunjungan Verifikasi is marked
   * Selesai: updates the Lokasi's pin, facilities, visit photos and
   * "dikunjungi" date (spec, Field Work). `by` is the visiting Petugas
   * Lapangan; the fieldwork module has already checked it against its task.
   */
  recordKunjunganVerifikasi(by: Actor, lokasiId: string, input: KunjunganVerifikasiInput): Promise<RecordKunjunganVerifikasiResult>;
  /** Whether this Lokasi Mitra has a completed Kunjungan Verifikasi (the publish gate's fact); false for an unknown id. */
  kunjunganVerifikasiSelesai(lokasiId: string): Promise<boolean>;
  /**
   * The fieldwork module calls this once a Cek Denah is marked Selesai: it
   * records the spot-check on the Lokasi (ticket 16's Terencana-switch input).
   */
  recordCekDenah(by: Actor, lokasiId: string, input: { checkedAt: Date; note: string }): Promise<RecordCekDenahResult>;
  /** The latest Cek Denah recorded on this Lokasi (ticket 16's Terencana-switch input), or null before the first one. */
  cekDenahOf(lokasiId: string): Promise<CekDenahRecord | null>;
  /**
   * Admin Platform publishes this Lokasi Mitra (Belum Tayang → Terverifikasi):
   * refused with the publish gate's checklist unless every item is met.
   * `input.tariffsChecked` is the one fact the Tariffs module owns; the
   * caller reads it (e.g. `tariffs.asStaff(by).tariffsChecked(lokasiId)`).
   */
  publish(by: Actor, lokasiId: string, input: PublishInput): Promise<PublishLokasiMitraResult>;
  /**
   * Admin Platform records that this Lokasi Mitra still meets the publish
   * gate, closing the Antrean's Tier 4 "publish-gate check" row (ticket 17),
   * audited.
   */
  recordPublishGateMasihTerpenuhi(by: Actor, lokasiId: string): Promise<WriteResult>;
  /**
   * Admin Platform switches "Pemesanan Terencana aktif" on, only once every
   * Petak is cleared and a Cek Denah is done. `input.hasPetakPerluVerifikasi`
   * is the Inventory module's own fact; the caller reads it.
   */
  activateTerencana(by: Actor, lokasiId: string, input: ActivateTerencanaInput): Promise<ActivateTerencanaResult>;
  /** A Terverifikasi Lokasi Mitra's public profile (no actor, for its Lokasi page); null for anything else. */
  publicLokasiMitra(lokasiId: string): Promise<PublicLokasiMitra | null>;
  /** Every Terverifikasi Lokasi Mitra, for the Daftar Lokasi Makam directory (no actor), filtered by city, one Lokasi Mitra, and facilities. */
  publicLokasiMitraList(query?: PublicLokasiMitraQuery): Promise<PublicLokasiMitraCard[]>;
  /** Every city with at least one Terverifikasi Lokasi Mitra, for the directory's city filter. */
  publicLokasiMitraCities(): Promise<string[]>;
  /** Every DKI TPU with its new-plot flag and the date that flag was checked (Admin Platform; empty for anyone else). */
  tpuDkiList(by: Actor): Promise<TpuDki[]>;
  /** Admin Platform adds a DKI TPU with the new-plot flag as found (which stamps the date it was checked), audited. */
  createTpuDki(by: Actor, input: NewTpuDki): Promise<CreateTpuDkiResult>;
  /** Admin Platform corrects a DKI TPU's name, address, city, pin or data source, audited; the flag is never touched here. */
  updateTpuDki(by: Actor, tpuId: string, input: TpuProfileInput): Promise<UpdateTpuDkiResult>;
  /** Admin Platform records what a TPU takes today, stamping and auditing the date the flag was checked. */
  updateTpuDkiFlag(by: Actor, tpuId: string, input: { menerimaMakamBaru: boolean }): Promise<UpdateTpuDkiFlagResult>;
  /** One TPU as a visitor reads it (no actor, for its public page); null for an id that is no TPU's. */
  publicTpuDki(tpuId: string): Promise<PublicTpuDki | null>;
  /** Every TPU, by name, for the Draft cards (no actor), narrowed by the directory's own city filter. */
  publicTpuDkiList(query?: PublicTpuDkiQuery): Promise<PublicTpuDki[]>;
  /**
   * The whole Daftar Lokasi Makam in one read: every Terverifikasi Lokasi Mitra
   * and every DKI TPU, by name, filtered by kind, by the one city filter and, for
   * Lokasi Mitra, by facilities (no actor).
   */
  publicLokasiMakamList(query?: LokasiMakamQuery): Promise<LokasiMakamCard[]>;
  /** Every city either kind is in, for the directory's city filter (no actor). */
  publicLokasiMakamCities(): Promise<string[]>;
  /** Signed URLs to a Terverifikasi Lokasi Mitra's Kunjungan Verifikasi visit photos (no actor, for its Lokasi page). */
  publicVisitPhotoUrls(lokasiId: string): Promise<string[]>;
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
    searchLokasiMitra: (by, query) => searchLokasiMitra(deps, by, query),
    lokasiMitraOfAdminLokasi: (by) => lokasiMitraOfAdminLokasi(deps, by),
    lokasiMitraCountsByStatus: (by) => lokasiMitraCountsByStatus(deps, by),
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
    nextHariLiburNasional: () => nextHariLiburNasional(deps),
    addHariLiburNasional: (by, input) => addHariLiburNasional(deps, by, input),
    removeHariLiburNasional: (by, input) => removeHariLiburNasional(deps, by, input),
    adminPlatformCalendar: () => readAdminPlatformCalendar(deps),
    jamOperasionalOf: (lokasiId) => jamOperasionalOf(deps, lokasiId),
    serviceHoursDeadline: (lokasiId, hours, start) => serviceHoursDeadline(deps, lokasiId, hours, start),
    saatDukaPaymentWindowHours: (lokasiId) => saatDukaPaymentWindowHours(deps, lokasiId),
    documentChecklistOf: (lokasiId) => documentChecklistOf(deps, lokasiId),
    bukaSekarang: (lokasiId) => bukaSekarang(deps, lokasiId),
    recordKunjunganVerifikasi: (by, lokasiId, input) => recordKunjunganVerifikasi(deps, by, lokasiId, input),
    kunjunganVerifikasiSelesai: (lokasiId) => kunjunganVerifikasiSelesai(deps, lokasiId),
    recordCekDenah: (by, lokasiId, input) => recordCekDenah(deps, by, lokasiId, input),
    cekDenahOf: (lokasiId) => cekDenahOf(deps, lokasiId),
    publish: (by, lokasiId, input) => publishLokasiMitra(deps, by, lokasiId, input),
    recordPublishGateMasihTerpenuhi: (by, lokasiId) => recordPublishGateMasihTerpenuhi(deps, by, lokasiId),
    activateTerencana: (by, lokasiId, input) => activateTerencana(deps, by, lokasiId, input),
    publicLokasiMitra: (lokasiId) => publicLokasiMitra(deps, lokasiId),
    publicLokasiMitraList: (query) => publicLokasiMitraList(deps, query),
    publicLokasiMitraCities: () => publicLokasiMitraCities(deps),
    tpuDkiList: (by) => tpuDkiList(deps, by),
    createTpuDki: (by, input) => createTpuDki(deps, by, input),
    updateTpuDki: (by, tpuId, input) => updateTpuDki(deps, by, tpuId, input),
    updateTpuDkiFlag: (by, tpuId, input) => updateTpuDkiFlag(deps, by, tpuId, input),
    publicTpuDki: (tpuId) => publicTpuDki(deps, tpuId),
    publicTpuDkiList: (query) => publicTpuDkiList(deps, query),
    publicLokasiMakamList: (query) => publicLokasiMakamList(deps, query),
    publicLokasiMakamCities: () => publicLokasiMakamCities(deps),
    publicVisitPhotoUrls: (lokasiId) => publicVisitPhotoUrls(deps, lokasiId),
  };
}
export {
  addWorkingDays,
  adminPlatformCalendar,
  daytimeHoursDeadline,
  deadline,
  isOpenAt,
  nextWorkingDayEnd,
  TPU_SCHEDULE,
  type HariLiburNasional,
  type JamOperasionalBelumDiisi,
  type JamOperasionalTanpaJamBuka,
  type WorkingTimeResult,
} from "./working-time";
