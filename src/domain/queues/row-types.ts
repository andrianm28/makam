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
import type { Pengurusan } from "@/domain/pengurusan";
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
    "konfirmasiLewatTenggat" | "antreanKonfirmasi" | "konfirmasiTerlambat" | "ditolak" | "saatDukaDitolak" | "antreanCatatPemakaman"
  >;
  /** The Antrean Lokasi's "Petak Perlu Verifikasi" row counts the Denah's own (ticket 23). */
  inventory: Pick<Inventory, "jumlahPetakPerluVerifikasi">;
  /**
   * The Antrean's Tier 3 "Pencairan" row reads the Payouts module's own query
   * (ticket 32): one open row per recipient with the 2 Hari Kerja deadline the
   * item was given when it became due.
   */
  payouts: Pick<Payouts, "pencairanJatuhTempo">;
  /** The Tier 1 "Konfirmasi TPU Saat Duka" row reads the Pengurusan module's own state. */
  pengurusan: Pick<Pengurusan, "konfirmasiTpuTerbuka">;
  /** The Antrean's Tier 3 "refund transfer" row reads the Refunds module's own query (ticket 31). */
  refunds: Pick<Refunds, "pengembalianJatuhTempo">;
  /**
   * The Antrean Lokasi's three Layanan rows and the Tier 2 "Layanan terlambat"
   * row read the Layanan module's own public reads, never its tables: what is due
   * today, what is coming and what ran late, at one Lokasi Mitra or across all.
   */
  layanan: Pick<Layanan, "pekerjaanUntukStafTerbaru" | "pekerjaanTerlambat">;
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
