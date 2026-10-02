/**
 * Work Queues: the Antrean (spec, domain module 14; ticket 17). A projection
 * of domain state: each row type (`./registry.ts`) is a query plus a deadline
 * rule, and rows close themselves when the state they read moves on. This
 * ticket delivers the framework plus its first four row types: Tier 4's three
 * (`./tier4-lokasi-rows.ts`, `./tier4-tugas-lapangan-row.ts`) and Tier 2's
 * Pembayaran Perlu Ditinjau (`./tier2-pembayaran-perlu-ditinjau-row.ts`,
 * spec-missing, from ticket 19's review). The rest of Tier 1–3 arrive with
 * their own tickets and need no change here beyond the registry.
 *
 * Owns tables: antrean_ambil (Ambil claims), catatan_internal (Catatan
 * Internal threads).
 *
 * Every write (Ambil, Catatan Internal) records an Entri Audit through the
 * Audit Log module in the same transaction, and re-checks `authorize` itself.
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Fieldwork } from "@/domain/fieldwork";
import type { Actor, Identity } from "@/domain/identity";
import type { Layanan } from "@/domain/layanan";
import type { Lokasi } from "@/domain/lokasi";
import type { Inventory } from "@/domain/inventory";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan } from "@/domain/pemesanan";
import type { Payouts } from "@/domain/payouts";
import type { Perpanjangan } from "@/domain/perpanjangan";
import type { Pengurusan } from "@/domain/pengurusan";
import type { Wakaf } from "@/domain/wakaf";
import type { Refunds } from "@/domain/refunds";
import type { Clock } from "@/ports/clock";
import { ambilPengurus, ambilRow, type AmbilRowResult, type PengurusAmbil } from "./ambil";
import { antrean, antreanCounters, type AntreanCounters, type AntreanRow } from "./antrean";
import { antreanLokasi, type AntreanLokasiAntrean } from "./antrean-lokasi";
import {
  aktifkanBertugas,
  bertugasOtomatisMatiTick,
  bertugasStatus,
  matikanBertugas,
  type AktifkanBertugasResult,
  type BertugasStatus,
  type MatikanBertugasInput,
  type MatikanBertugasResult,
} from "./bertugas";
import {
  daftarTransferMingguan,
  laporanBulanan,
  type DaftarTransferResult,
  type LaporanResult,
} from "./laporan";
import { barisMasihTerbuka, barisMasihTerbukaBelumDiambil, peringatanTier1Tick, tier1BelumDiambil, type PeringatanDeps, type PeringatanTickResult } from "./peringatan";
import {
  catatanInternalFor,
  tambahCatatanInternal,
  type CatatanInternal,
  type CatatanInternalInput,
  type TambahCatatanInternalResult,
} from "./catatan-internal";

export { catatanInternalInputSchema, type CatatanInternal, type CatatanInternalInput, type TambahCatatanInternalResult } from "./catatan-internal";
export type { AmbilRowResult, PengurusAmbil } from "./ambil";
export {
  barisLaporan,
  bulanLaporanSchema,
  laporanKeCsv,
  seninMinggu,
  tanggalMingguSchema,
  type BarisLaporan,
  type DaftarTransfer,
  type DaftarTransferResult,
  type Laporan,
  type LaporanRefusal,
  type LaporanResult,
  type TransferKeluar,
} from "./laporan";
export {
  BERTUGAS_BERAKHIR_JAM_WIB,
  BERTUGAS_MAKSIMUM_JAM,
  bertugasBerakhirAt,
  matikanBertugasInputSchema,
  type AktifkanBertugasResult,
  type BarisPerluPenanganan,
  type BertugasAkun,
  type BertugasStatus,
  type MatikanBertugasInput,
  type MatikanBertugasResult,
} from "./bertugas";
export { ESKALASI_TIDAK_DIAMBIL_MENIT, type PeringatanTickResult } from "./peringatan";
export { rowKeyOf, type AntreanCounters, type AntreanRow } from "./antrean";
export { antreanLokasiRowTypes, type AntreanLokasiGrup, type AntreanLokasiRow, type AntreanLokasiRowType } from "./antrean-lokasi";
export { antreanRowTypes } from "./registry";
export { TPU_FLAG_STALE_DAYS } from "./tier4-tpu-row";
/** The Tier 1 row type's key: a family page looks its own Ambil claim up by it (ticket 45). */
export { KONFIRMASI_TPU_SAAT_DUKA_TYPE } from "./tier1-konfirmasi-tpu-saat-duka-row";
export type { AntreanRowDeps, AntreanRowType, AntreanTier, RawAntreanRow } from "./row-types";

export interface QueuesModuleDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** The Antrean's Tier 4 Lokasi rows read every Lokasi Mitra's status and publish/recheck timestamps, and the Tier 4 TPU flag row every DKI TPU's flag date. */
  lokasi: Pick<Lokasi, "allLokasiMitra" | "tpuDkiList">;
  /** The Antrean's Tier 4 rows read every Tugas; its Tier 2 "Ambil surat pengantar" and Tier 3 "Setor Retribusi" rows read this module's own two reads. */
  fieldwork: Pick<Fieldwork, "allTugasLapangan" | "ambilSuratPengantarTerbuka" | "setorRetribusiTerbuka">;
  /** The Antrean's Tier 2 Pembayaran Perlu Ditinjau row reads Billing's own query. */
  billing: Pick<Billing, "pembayaranPerluDitinjau" | "tagihanLewatJatuhTempo" | "laporan">;
  /** The Antrean's Tier 2 Telepon Pemesan row reads the open call rows (ticket 20). */
  notifications: Pick<Notifications, "teleponPemesanTerbuka" | "teleponPemesanTercatat" | "pushDevices">;
  /** The confirmation rows read the Pemesanan module's own state (the Tier 1 late row, the Antrean Lokasi's confirmations and its "Catat Pemakaman" rows, plus the decline rows). */
  pemesanan: Pick<
    Pemesanan,
    | "konfirmasiLewatTenggat"
    | "antreanKonfirmasi"
    | "konfirmasiTerlambat"
    | "ditolak"
    | "saatDukaDitolak"
    | "antreanCatatPemakaman"
    | "antreanKonfirmasiTerencana"
    | "konfirmasiTerencanaLewatTenggat"
    // The Pembatalan rows of a paid Terencana order: the Antrean Lokasi's and Admin Platform's Tier 3 refund approval (ticket 38).
    | "antreanPembatalan"
    | "persetujuanRefundPembatalan"
  >;
  /** The Antrean Lokasi's "Petak Perlu Verifikasi" row counts the Denah's own Petak. */
  inventory: Pick<Inventory, "jumlahPetakPerluVerifikasi" | "hakPakaiMasaTenggang">;
  /** The Antrean's Tier 3 Pencairan row reads the Payouts module's own query. */
  payouts: Pick<Payouts, "pencairanJatuhTempo" | "pencairanDibayar" | "transferKeluar">;
  /** The Tier 1 "Konfirmasi TPU Saat Duka" row reads the Pengurusan module's own state. */
  pengurusan: Pick<Pengurusan, "konfirmasiTpuTerbuka" | "pengajuanIptmTerbuka" | "periksaBerkasTerbuka" | "pengajuanBerkasTerbuka">;
  /** The Antrean Lokasi's "Periksa dokumen Perpanjangan" row reads the Perpanjangan module's own open requests (ticket 41). */
  perpanjangan: Pick<Perpanjangan, "antreanPeriksaDokumen">;
  /** The Antrean's Tier 3 "refund transfer" row reads the Refunds module's own query (ticket 31). */
  refunds: Pick<Refunds, "pengembalianJatuhTempo" | "pengembalianDibayar" | "transferKeluar">;
  /**
   * The Antrean's Tier 3 "Pengajuan Wakaf" row reads the Wakaf module's own open Pengajuan (ticket 58).
   * Optional so a fixture that composes no Wakaf has no such row; the runtime always passes it.
   */
  wakaf?: Pick<Wakaf, "pengajuanTerbuka">;
  /** The Ambil claim a family's own order page shows, as a name and a contact number; Bertugas names its Admin Platform. */
  identity: Pick<Identity, "staffAccountById" | "staffAccounts">;
  /** The Tier 4 Mitra Jasa rows (onboarding and the monthly scorecard review) read the Layanan module's own queries. */
  /** The Antrean Lokasi's three Layanan rows and the Tier 2 late row read the Layanan module's own lists (ticket 50). */
  layanan: Pick<
    Layanan,
    | "mitraJasaBelumLengkap"
    | "tinjauanTerbuka"
    | "pekerjaanUntukStafTerbaru"
    | "pekerjaanTerlambat"
    | "keluhanTerbuka"
    | "keluhanTpuTerbukaAntrean"
    | "kerjakanUlangUntukLokasi"
    | "pekerjaanTpuHariIniTanpaMitra"
    | "pekerjaanTpuPerluTindakan"
    | "pekerjaanTpuMenungguVerifikasi"
  >;
}

export interface Queues {
  /** Every open Antrean row, sorted by tier then deadline (Admin Platform only; empty for anyone else). */
  antrean(by: Actor): Promise<AntreanRow[]>;
  /** The counter strip (spec, story 144): counters with no source yet show 0, filled in by later tickets. */
  counters(by: Actor): Promise<AntreanCounters>;
  /**
   * The Admin Lokasi's own list of open work for one Lokasi Mitra, in Mendesak
   * and Lainnya, sorted by deadline (spec, Work Queues; ticket 23). Rows only:
   * no Ambil claims, no tiers, no Bertugas; an order or a Petak that moves on
   * closes its own row.
   */
  antreanLokasi(by: Actor, lokasiId: string): Promise<AntreanLokasiAntrean>;
  /** The monthly Laporan ("YYYY-MM", Asia/Jakarta month boundaries): orders, Rp collected, platform fees, Pencairan, refunds, Tidak Tertagih. Admin Platform only (ticket 33). */
  laporanBulanan(by: Actor, bulan: string): Promise<LaporanResult>;
  /** Every transfer that left the bank in the Monday-to-Sunday week a WIB date falls in, Pencairan and refunds, with approver and proof. Admin Platform only (ticket 33). */
  daftarTransferMingguan(by: Actor, tanggal: string): Promise<DaftarTransferResult>;
  /** Any Admin Platform takes (Ambil) a row, replacing any earlier claim; logged in the Audit Log. */
  ambilRow(by: Actor, input: { type: string; subjectId: string }): Promise<AmbilRowResult>;
  /**
   * The staff member who has taken a row, as a name and a contact number, or null
   * when nobody has. A read, and the one that lets a family see who is handling
   * its own order (spec, story 73) without the Antrean page reading identity.
   */
  ambilPengurus(row: { type: string; subjectId: string }): Promise<PengurusAmbil | null>;
  /** Who is Bertugas now and the signed-in Admin Platform's own state, for the Antrean's header; null for anyone but Admin Platform (ticket 28). */
  bertugas(by: Actor): Promise<BertugasStatus | null>;
  /** The signed-in Admin Platform goes on duty; refused without an active Perangkat Push (ADR 0004). Audited. */
  aktifkanBertugas(by: Actor): Promise<AktifkanBertugasResult>;
  /**
   * The signed-in Admin Platform goes off duty by hand: each row they hold is released, or keeps
   * its claim and gets a Catatan Internal; a row not dealt with refuses the switch-off and is named. Audited.
   */
  matikanBertugas(by: Actor, input: MatikanBertugasInput): Promise<MatikanBertugasResult>;
  /** How many Tier 1 rows nobody has taken: the red banner in the header of every staff page of an Admin Platform (ticket 28). */
  tier1BelumDiambil(by: Actor): Promise<number>;
  /** Admin Platform adds a Catatan Internal on any row or order; audited, never shown to the Pemesan, Mitra Jasa or Admin Lokasi. */
  tambahCatatanInternal(by: Actor, input: CatatanInternalInput): Promise<TambahCatatanInternalResult>;
  /** Every Catatan Internal on one subject, oldest first (Admin Platform only). */
  catatanInternal(by: Actor, subjectKind: string, subjectId: string): Promise<CatatanInternal[]>;
}

export function createQueues(deps: QueuesModuleDeps): Queues {
  return {
    antrean: (by) => antrean(deps, by),
    counters: (by) => antreanCounters(deps, by),
    antreanLokasi: (by, lokasiId) => antreanLokasi(deps, by, lokasiId),
    laporanBulanan: (by, bulan) => laporanBulanan(deps, by, bulan),
    daftarTransferMingguan: (by, tanggal) => daftarTransferMingguan(deps, by, tanggal),
    ambilRow: (by, input) => ambilRow(deps, by, input),
    ambilPengurus: (row) => ambilPengurus(deps, row),
    bertugas: (by) => bertugasStatus(deps, by),
    aktifkanBertugas: (by) => aktifkanBertugas(deps, by),
    matikanBertugas: (by, input) => matikanBertugas(deps, by, input),
    tier1BelumDiambil: (by) => tier1BelumDiambil(deps, by),
    tambahCatatanInternal: (by, input) => tambahCatatanInternal(deps, by, input),
    catatanInternal: (by, subjectKind, subjectId) => catatanInternalFor(deps, by, subjectKind, subjectId),
  };
}

/**
 * The worker's side of the Antrean (ticket 28): the Tier 1 alert tick and the
 * Bertugas switch-off tick. Built from the four things a Tier 1 row reads plus
 * Identity and Notifications, so the worker needs no signed-in actor and none of
 * the neighbours only the Antrean page reads.
 */
export interface QueuesTicks {
  /** Alerts Tier 1 rows (Bertugas or all, the 06:00 night rule) and escalates them at 30 and 90 min. Idempotent. */
  peringatanTick(now: Date): Promise<PeringatanTickResult>;
  /** Whether a Tier 1 row (by its key on an alert) is still open and untaken: Notifications drops a retried escalation for one that is not. */
  barisMasihTerbukaBelumDiambil(rowKey: string): Promise<boolean>;
  /** Whether a Tier 1 row (by its key on an alert) is still open, taken or not (ticket 96). */
  barisMasihTerbuka(rowKey: string): Promise<boolean>;
  /** Switches off every Bertugas whose 18:00 WIB or 12 h has come, leaving claims and notes. Idempotent. */
  bertugasTick(now: Date): Promise<{ dimatikan: number }>;
}

export function createQueuesTicks(deps: PeringatanDeps): QueuesTicks {
  return {
    peringatanTick: (now) => peringatanTier1Tick(deps, now),
    barisMasihTerbukaBelumDiambil: (rowKey) => barisMasihTerbukaBelumDiambil(deps, rowKey),
    barisMasihTerbuka: (rowKey) => barisMasihTerbuka(deps, rowKey),
    bertugasTick: (now) => bertugasOtomatisMatiTick(deps, now),
  };
}
