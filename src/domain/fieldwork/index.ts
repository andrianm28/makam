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
import type { Billing } from "@/domain/billing";
import type { Actor, Identity } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import { ambilSuratPengantarTerbuka, type AmbilSuratPengantarTerbuka } from "./ambil-surat-pengantar";
import {
  catatSetorRetribusi,
  setorRetribusiTerbuka,
  type CatatSetorRetribusiResult,
  type SetorRetribusiTerbuka,
} from "./setor-retribusi";
import {
  allTugasLapangan,
  completeTugasLapangan,
  createTugasLapangan,
  evidenceUrl,
  readTugasLapangan,
  tugasSaya,
  type CompleteTugasLapanganResult,
  type CreateTugasLapanganResult,
  type EvidenceUpload,
  type EvidenceUrlResult,
  type NewTugasLapangan,
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
  setorRetribusiFormSchema,
  tugasLapanganTypeLabels,
  type CekDenahForm,
  type GenericForm,
  type KunjunganVerifikasiForm,
  type RequiredUpload,
  type SetorRetribusiForm,
  type TugasLapanganType,
} from "./types";
export { ambilSuratPengantarTerbuka, type AmbilSuratPengantarTerbuka } from "./ambil-surat-pengantar";
export {
  catatSetorRetribusiSchema,
  SETOR_RETRIBUSI_HARI_KERJA,
  type CatatSetorRetribusiInput,
  type CatatSetorRetribusiResult,
  type SetorRetribusi,
  type SetorRetribusiTerbuka,
} from "./setor-retribusi";
export { tugasLapanganStatuses, tugasLapanganTypes, type TugasLapanganUpload } from "./schema";

export interface FieldworkModuleDeps {
  db: Database;
  clock: Clock;
  /** The private bucket, for a Tugas Lapangan's required uploads. */
  files: FileStore;
  audit: AuditLog;
  identity: Pick<Identity, "staffAccounts">;
  notifications: Pick<Notifications, "sendStaffAlert">;
  lokasi: Pick<Lokasi, "recordKunjunganVerifikasi" | "recordCekDenah" | "adminPlatformCalendar">;
  /** Billing's own read of the Lunas Retribusi Tagihan, for the Tier 3 row and the recording that closes it. */
  billing: Pick<Billing, "tagihanRetribusiLunas">;
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
  /** Every open "Ambil surat pengantar" Tugas, soonest burial day first: the Antrean's Tier 2 row reads these. */
  ambilSuratPengantarTerbuka(): Promise<AmbilSuratPengantarTerbuka[]>;
  /** Every open Setor Retribusi: a Lunas Tagihan with a non-zero Retribusi Pemda line nobody has paid on to the town yet. */
  setorRetribusiTerbuka(): Promise<SetorRetribusiTerbuka[]>;
  /**
   * Admin Platform, or the Petugas who paid in person, records a Tagihan's
   * Retribusi Pemda line paid to the town with its proof; audited, and it closes
   * the Tier 3 "Setor Retribusi" row. A second recording of the same Tagihan is
   * refused, and a Rp 0 or retribusi-free one never reaches it.
   */
  catatSetorRetribusi(
    by: Actor,
    input: unknown,
    tugasLapanganId?: string | null,
  ): Promise<CatatSetorRetribusiResult>;
  /**
   * The same functions inside an open transaction (another module's), committing
   * or rolling back with it: a Tugas created here exists only if the caller's
   * transaction does.
   */
  within(tx: Database): Fieldwork;
}

export function createFieldwork(deps: FieldworkModuleDeps): Fieldwork {
  return {
    createTugasLapangan: (by, input) => createTugasLapangan(deps, by, input),
    allTugasLapangan: (by) => allTugasLapangan(deps, by),
    tugasSaya: (by) => tugasSaya(deps, by),
    tugasLapangan: (by, id) => readTugasLapangan(deps, by, id),
    evidenceUrl: (by, id, uploadId) => evidenceUrl(deps, by, id, uploadId),
    completeTugasLapangan: (by, id, input) => completeTugasLapangan(deps, by, id, input),
    ambilSuratPengantarTerbuka: () => ambilSuratPengantarTerbuka(deps),
    setorRetribusiTerbuka: () => setorRetribusiTerbuka(deps),
    catatSetorRetribusi: (by, input, tugasLapanganId = null) => catatSetorRetribusi(deps, by, input, tugasLapanganId),
    within: (tx) => createFieldwork({ ...deps, db: tx }),
  };
}
