/**
 * The Antrean's row-type registry (spec, Work Queues; ticket 17): each row
 * type is a query plus a deadline rule and the link to its subject, so adding
 * one needs no change to the Antrean UI or aggregator (`./antrean.ts`).
 */
import type { Billing } from "@/domain/billing";
import type { Fieldwork } from "@/domain/fieldwork";
import type { Actor } from "@/domain/identity";
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

export type AntreanTier = 1 | 2 | 3 | 4;

/** What a row type needs to run its query: only the neighbour modules' own public reads, never their tables. */
export interface AntreanRowDeps {
  clock: Clock;
  /** The Tier 4 Lokasi rows read every Lokasi Mitra; the Tier 4 TPU flag row reads every DKI TPU. */
  lokasi: Pick<Lokasi, "allLokasiMitra" | "tpuDkiList">;
  /** The Tier 4 rows read every Tugas; the Tier 2 "Ambil surat pengantar" and Tier 3 "Setor Retribusi" rows read this module's own two reads. */
  fieldwork: Pick<Fieldwork, "allTugasLapangan" | "ambilSuratPengantarTerbuka" | "setorRetribusiTerbuka">;
  billing: Pick<Billing, "pembayaranPerluDitinjau" | "tagihanLewatJatuhTempo">;
  /**
   * The Antrean's Tier 2 Telepon Pemesan row reads the open call rows, and its
   * Tier 1 "Saat Duka ditolak" row reads whether one has already been logged
   * (ticket 20, ticket 24).
   */
  notifications: Pick<Notifications, "teleponPemesanTerbuka" | "teleponPemesanTercatat">;
  /**
   * The Saat Duka confirmation and decline rows read the Pemesanan module's own
   * state: the Tier 1 "Konfirmasi Lokasi terlambat" row (ticket 23), its Tier 1
   * "Saat Duka ditolak" row (ticket 24), the Antrean Lokasi's open
   * confirmations and its "Catat Pemakaman" rows (ticket 25). Never its
   * tables.
   */
  pemesanan: Pick<
    Pemesanan,
    | "konfirmasiLewatTenggat"
    | "antreanKonfirmasi"
    | "konfirmasiTerlambat"
    | "ditolak"
    | "saatDukaDitolak"
    | "antreanCatatPemakaman"
    // The Terencana rows: the Antrean Lokasi's "Konfirmasi Terencana" and Admin Platform's Tier 3 late row (ticket 37).
    | "antreanKonfirmasiTerencana"
    | "konfirmasiTerencanaLewatTenggat"
    // The Pembatalan rows of a paid Terencana order: the Antrean Lokasi's and Admin Platform's Tier 3 refund approval (ticket 38).
    | "antreanPembatalan"
    | "persetujuanRefundPembatalan"
    // The Antrean Lokasi's own Pengembalian / Ganti Pemegang Hak rows (ticket 39).
    | "antreanPermintaanHakPakai"
  >;
  /** The Antrean Lokasi's "Petak Perlu Verifikasi" row counts the Denah's own (ticket 23). */
  inventory: Pick<Inventory, "jumlahPetakPerluVerifikasi" | "hakPakaiMasaTenggang">;
  /**
   * The Antrean's Tier 3 "Pencairan" row reads the Payouts module's own query
   * (ticket 32): one open row per recipient with the 2 Hari Kerja deadline the
   * item was given when it became due.
   */
  payouts: Pick<Payouts, "pencairanJatuhTempo">;
  /** The Tier 1 "Konfirmasi TPU Saat Duka" row reads the Pengurusan module's own state. */
  pengurusan: Pick<Pengurusan, "konfirmasiTpuTerbuka" | "pengajuanIptmTerbuka" | "periksaBerkasTerbuka" | "pengajuanBerkasTerbuka">;
  /** The Antrean Lokasi's "Periksa dokumen Perpanjangan" row reads the Perpanjangan module's own open requests (ticket 41). */
  perpanjangan: Pick<Perpanjangan, "antreanPeriksaDokumen">;
  /** The Antrean's Tier 3 "refund transfer" row reads the Refunds module's own query (ticket 31). */
  refunds: Pick<Refunds, "pengembalianJatuhTempo">;
  /** The Antrean's Tier 3 "Pengajuan Wakaf" row reads the Wakaf module's own open Pengajuan (ticket 58); absent where none is composed. */
  wakaf?: Pick<Wakaf, "pengajuanTerbuka">;
  /** The Tier 4 Mitra Jasa rows (onboarding and the monthly scorecard review) read the Layanan module's own queries. */
  /**
   * The Antrean Lokasi's three Layanan rows and the Tier 2 "Layanan terlambat"
   * row read the Layanan module's own public reads, never its tables: what is due
   * today, what is coming and what ran late, at one Lokasi Mitra or across all.
   */
  layanan: Pick<
    Layanan,
    | "mitraJasaBelumLengkap"
    | "tinjauanTerbuka"
    | "pekerjaanUntukStafTerbaru"
    | "pekerjaanTerlambat"
    | "keluhanTerbuka"
    | "keluhanTpuTerbukaAntrean"
    | "kerjakanUlangUntukLokasi"
    // The TPU jobs' Tier 1 and Tier 2 rows (ticket 56).
    | "pekerjaanTpuHariIniTanpaMitra"
    | "pekerjaanTpuPerluTindakan"
    | "pekerjaanTpuMenungguVerifikasi"
  >;
}

/** One open row, before the aggregator attaches its type, tier, label and Ambil claim. */
export interface RawAntreanRow {
  /** What kind of thing the row is about, e.g. "lokasi_mitra", "tugas_lapangan": Catatan Internal's own key. */
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  href: string;
  /** null when this occurrence of the row has no deadline. */
  deadline: Date | null;
}

/** A row type's declaration: tier, query and deadline rule (the query returns each open row already past its own deadline rule). */
export interface AntreanRowType {
  /** Stable across releases: also half of a row's Ambil and Catatan Internal key (with `subjectId`). */
  key: string;
  tier: AntreanTier;
  label: string;
  /** Every row of this type currently open, for `by` (Admin Platform; empty for anyone else, see each type). */
  rows(deps: AntreanRowDeps, by: Actor): Promise<RawAntreanRow[]>;
}

/**
 * What a Tier 1 row type reads (ticket 28): only these six, so the worker,
 * which alerts on Tier 1 rows and has no signed-in Admin Platform, can build it
 * without composing every neighbour the rest of the Antrean reads.
 */
export type Tier1RowDeps = Pick<AntreanRowDeps, "clock" | "notifications" | "pemesanan"> & {
  /** The worker's Tier 1 rows read only the open confirmations; the IPTM filing row is Tier 3 and is not built there. */
  pengurusan: Pick<AntreanRowDeps["pengurusan"], "konfirmasiTpuTerbuka">;
  /** The Tier 1 "Keluhan" row (ticket 51) reads the Layanan module's list of Keluhan waiting for a decision; the TPU jobs' Tier 1 row (ticket 56) reads the jobs due today that no Mitra Jasa holds. */
  layanan: Pick<AntreanRowDeps["layanan"], "keluhanTerbuka" | "keluhanTpuTerbukaAntrean" | "pekerjaanTpuHariIniTanpaMitra">;
};

/**
 * An open Tier 1 row with its anchor: `sejak` is when the row appeared, a fact the
 * row's own subject already carries (the order's submission, the decline, the
 * confirmation deadline that passed), so every alert clock (30 min, 90 min, the
 * night hold) counts from it and not from when a tick first happened to see the
 * row (owner decision 2026-09-29, ticket 28).
 */
export interface Tier1Row extends RawAntreanRow {
  sejak: Date;
}

/**
 * A Tier 1 row type: the only kind that alerts (spec, Work Queues), so its query
 * takes no actor. `tundaMalam` and `eskalasiLanjutMenit` are the hooks the alerts read
 * (ticket 28; ticket 45's Konfirmasi TPU Saat Duka sets both).
 */
export interface Tier1RowType extends Omit<AntreanRowType, "tier" | "rows"> {
  tier: 1;
  rows(deps: Tier1RowDeps): Promise<Tier1Row[]>;
  /** A row of a TPU subject opened outside 06:00–18:00 WIB is alerted at 06:00, not in the night. */
  tundaMalam?: true;
  /** A further all-hands alert this many minutes after the first alert, while the row is still open. */
  eskalasiLanjutMenit?: number;
}
