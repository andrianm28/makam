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
import type { Lokasi } from "@/domain/lokasi";
import type { Inventory } from "@/domain/inventory";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan } from "@/domain/pemesanan";
import type { Payouts } from "@/domain/payouts";
import type { Pengurusan } from "@/domain/pengurusan";
import type { Refunds } from "@/domain/refunds";
import type { Clock } from "@/ports/clock";
import { ambilPengurus, ambilRow, type AmbilRowResult, type PengurusAmbil } from "./ambil";
import { antrean, antreanCounters, type AntreanCounters, type AntreanRow } from "./antrean";
import { antreanLokasi, type AntreanLokasiAntrean } from "./antrean-lokasi";
import {
  catatanInternalFor,
  tambahCatatanInternal,
  type CatatanInternal,
  type CatatanInternalInput,
  type TambahCatatanInternalResult,
} from "./catatan-internal";

export { catatanInternalInputSchema, type CatatanInternal, type CatatanInternalInput, type TambahCatatanInternalResult } from "./catatan-internal";
export type { AmbilRowResult, PengurusAmbil } from "./ambil";
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
  billing: Pick<Billing, "pembayaranPerluDitinjau" | "tagihanLewatJatuhTempo">;
  /** The Antrean's Tier 2 Telepon Pemesan row reads the open call rows (ticket 20). */
  notifications: Pick<Notifications, "teleponPemesanTerbuka" | "teleponPemesanTercatat">;
  /** The confirmation rows read the Pemesanan module's own state (the Tier 1 late row, the Antrean Lokasi's confirmations and its "Catat Pemakaman" rows, plus the decline rows). */
  pemesanan: Pick<
    Pemesanan,
    "konfirmasiLewatTenggat" | "antreanKonfirmasi" | "konfirmasiTerlambat" | "ditolak" | "saatDukaDitolak" | "antreanCatatPemakaman"
  >;
  /** The Antrean Lokasi's "Petak Perlu Verifikasi" row counts the Denah's own Petak. */
  inventory: Pick<Inventory, "jumlahPetakPerluVerifikasi">;
  /** The Antrean's Tier 3 Pencairan row reads the Payouts module's own query. */
  payouts: Pick<Payouts, "pencairanJatuhTempo">;
  /** The Tier 1 "Konfirmasi TPU Saat Duka" row reads the Pengurusan module's own state. */
  pengurusan: Pick<Pengurusan, "konfirmasiTpuTerbuka">;
  /** The Antrean's Tier 3 "refund transfer" row reads the Refunds module's own query (ticket 31). */
  refunds: Pick<Refunds, "pengembalianJatuhTempo">;
  /** The Ambil claim a family's own order page shows, as a name and a contact number. */
  identity: Pick<Identity, "staffAccountById">;
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
  /** Any Admin Platform takes (Ambil) a row, replacing any earlier claim; logged in the Audit Log. */
  ambilRow(by: Actor, input: { type: string; subjectId: string }): Promise<AmbilRowResult>;
  /**
   * The staff member who has taken a row, as a name and a contact number, or null
   * when nobody has. A read, and the one that lets a family see who is handling
   * its own order (spec, story 73) without the Antrean page reading identity.
   */
  ambilPengurus(row: { type: string; subjectId: string }): Promise<PengurusAmbil | null>;
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
    ambilRow: (by, input) => ambilRow(deps, by, input),
    ambilPengurus: (row) => ambilPengurus(deps, row),
    tambahCatatanInternal: (by, input) => tambahCatatanInternal(deps, by, input),
    catatanInternal: (by, subjectKind, subjectId) => catatanInternalFor(deps, by, subjectKind, subjectId),
  };
}
