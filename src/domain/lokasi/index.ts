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
  lokasiMitraOfAdminLokasi,
  readLokasiMitra,
  setDocumentChecklist,
  setPoliciesAndFlags,
  type BankAccount,
  type ChangeBankAccountResult,
  type CreateLokasiMitraResult,
  type LokasiMitraResult,
  type LokasiMitraSummary,
  type NewLokasiMitra,
  type SetPoliciesResult,
  type WriteResult,
} from "./lokasi-mitra";
import type { LokasiFlags, LokasiPolicies } from "./policies";

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
export type {
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
  /** One Lokasi Mitra's record, for Admin Platform or one of its Admin Lokasi. */
  lokasiMitra(by: Actor, lokasiId: string): Promise<LokasiMitraResult>;
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
}

export function createLokasi(deps: LokasiModuleDeps): Lokasi {
  return {
    createLokasiMitra: (by, input) => createLokasiMitra(deps, by, input),
    lokasiMitra: (by, lokasiId) => readLokasiMitra(deps, by, lokasiId),
    setDocumentChecklist: (by, lokasiId, input) => setDocumentChecklist(deps, by, lokasiId, input),
    setPoliciesAndFlags: (by, lokasiId, input) => setPoliciesAndFlags(deps, by, lokasiId, input),
    changeBankAccount: (by, lokasiId, input) => changeBankAccount(deps, by, lokasiId, input),
    inviteAdminLokasi: (by, lokasiId, input) => inviteAdminLokasi(deps, by, lokasiId, input),
    adminLokasiOf: (by, lokasiId) => adminLokasiOfLokasi(deps, by, lokasiId),
    removeAdminLokasi: (by, lokasiId, input) => removeAdminLokasiFromLokasi(deps, by, lokasiId, input),
    allLokasiMitra: (by) => allLokasiMitra(deps, by),
    lokasiMitraOfAdminLokasi: (by) => lokasiMitraOfAdminLokasi(deps, by),
  };
}
