/**
 * Field Work: Tugas Lapangan for Petugas Lapangan (spec, domain module 13).
 *
 * Owns table: fieldwork_tugas.
 *
 * Kunjungan Verifikasi and Cek Denah are fully built (ticket 15): completing
 * either calls into the Lokasi module's own public functions, since Lokasi
 * facts (pin, visit photos, facilities, "dikunjungi" date, the Cek Denah
 * record) are written only there (AGENTS.md). Ambil surat pengantar, Berkas
 * IPTM and Survei Wakaf are typed hooks for tickets 45, 46 and 58.
 *
 * Every write is a staff write: it records an Entri Audit through the Audit
 * Log module in the same transaction, and re-checks `authorize` itself. There
 * is no Audit Log view for Petugas Lapangan (CONTEXT.md, Audit Log), and a
 * Petugas Lapangan sees only the cases assigned to them (spec, story 175).
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Actor, Identity } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import {
  allTugasLapangan,
  completeTugasLapangan,
  createTugasLapangan,
  evidenceUrl,
  newTugasLapanganSchema,
  readTugasLapangan,
  tugasSaya,
  type CompleteTugasLapanganResult,
  type CreateTugasLapanganResult,
  type EvidenceUpload,
  type EvidenceUrlResult,
  type NewTugasLapangan,
  type NotFound,
  type TugasLapangan,
  type TugasLapanganResult,
} from "./tugas";

export { newTugasLapanganSchema } from "./tugas";
export type {
  CompleteTugasLapanganResult,
  CreateTugasLapanganResult,
  EvidenceUpload,
  EvidenceUrlResult,
  NewTugasLapangan,
  NotFound,
  TugasLapangan,
  TugasLapanganResult,
} from "./tugas";
export {
  cekDenahFormSchema,
  formSchemaFor,
  genericFormSchema,
  kunjunganVerifikasiFormSchema,
  requiredUploadsByType,
  tugasLapanganTypeLabels,
  type CekDenahForm,
  type GenericForm,
  type KunjunganVerifikasiForm,
  type RequiredUpload,
  type TugasLapanganType,
} from "./types";
export { tugasLapanganStatuses, tugasLapanganTypes, type TugasLapanganUpload } from "./schema";

export interface FieldworkModuleDeps {
  db: Database;
  clock: Clock;
  /** The private bucket, for a Tugas Lapangan's required uploads. */
  files: FileStore;
  audit: AuditLog;
  identity: Pick<Identity, "staffAccounts">;
  notifications: Pick<Notifications, "sendStaffAlert">;
  lokasi: Pick<Lokasi, "recordKunjunganVerifikasi" | "recordCekDenah">;
}

export interface Fieldwork {
  /** Admin Platform creates and assigns a Tugas Lapangan to one Petugas Lapangan, audited; sends a Peringatan Staf. */
  createTugasLapangan(by: Actor, input: NewTugasLapangan): Promise<CreateTugasLapanganResult>;
  /** Every Tugas Lapangan, by planned date (Admin Platform; empty for anyone else). */
  allTugasLapangan(by: Actor): Promise<TugasLapangan[]>;
  /** The signed-in Petugas Lapangan's own "Tugas saya": every task assigned to them, by planned date. */
  tugasSaya(by: Actor): Promise<TugasLapangan[]>;
  /** One Tugas Lapangan, for Admin Platform or its assigned Petugas Lapangan only. */
  tugasLapangan(by: Actor, id: string): Promise<TugasLapanganResult>;
  /** A signed URL to one uploaded evidence file, for Admin Platform or its assigned Petugas Lapangan only. */
  evidenceUrl(by: Actor, id: string, uploadId: string): Promise<EvidenceUrlResult>;
  /**
   * The assigned Petugas Lapangan marks a Tugas Lapangan Selesai: refused
   * while any required upload for its type is missing or its form does not
   * validate. Audited; a completed Kunjungan Verifikasi or Cek Denah updates
   * the Lokasi first (see the module comment).
   */
  completeTugasLapangan(
    by: Actor,
    id: string,
    input: { form: unknown; uploads: EvidenceUpload[] },
  ): Promise<CompleteTugasLapanganResult>;
}

export function createFieldwork(deps: FieldworkModuleDeps): Fieldwork {
  return {
    createTugasLapangan: (by, input) => createTugasLapangan(deps, by, input),
    allTugasLapangan: (by) => allTugasLapangan(deps, by),
    tugasSaya: (by) => tugasSaya(deps, by),
    tugasLapangan: (by, id) => readTugasLapangan(deps, by, id),
    evidenceUrl: (by, id, uploadId) => evidenceUrl(deps, by, id, uploadId),
    completeTugasLapangan: (by, id, input) => completeTugasLapangan(deps, by, id, input),
  };
}
