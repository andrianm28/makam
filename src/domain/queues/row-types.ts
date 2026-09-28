/**
 * The Antrean's row-type registry (spec, Work Queues; ticket 17): each row
 * type is a query plus a deadline rule and the link to its subject, so adding
 * one needs no change to the Antrean UI or aggregator (`./antrean.ts`).
 */
import type { Billing } from "@/domain/billing";
import type { Fieldwork } from "@/domain/fieldwork";
import type { Actor, Identity } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Inventory } from "@/domain/inventory";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan } from "@/domain/pemesanan";
import type { Payouts } from "@/domain/payouts";
import type { Clock } from "@/ports/clock";

export type AntreanTier = 1 | 2 | 3 | 4;

/** What a row type needs to run its query: only the neighbour modules' own public reads, never their tables. */
export interface AntreanRowDeps {
  clock: Clock;
  /** The Tier 4 Lokasi rows read every Lokasi Mitra; the Tier 4 TPU flag row reads every DKI TPU. */
  lokasi: Pick<Lokasi, "allLokasiMitra" | "tpuDkiList">;
  fieldwork: Pick<Fieldwork, "allTugasLapangan">;
  billing: Pick<Billing, "pembayaranPerluDitinjau">;
  /**
   * The Antrean's Tier 2 Telepon Pemesan row reads the open call rows, its
   * Tier 1 "Saat Duka ditolak" row reads whether one has already been logged
   * (ticket 20, ticket 24), and the Tier 1 alerts read the Perangkat Push that
   * Bertugas needs and send the Peringatan Staf themselves (ticket 28).
   */
  notifications: Pick<
    Notifications,
    "teleponPemesanTerbuka" | "teleponPemesanTercatat" | "sendStaffAlert" | "pushDevices"
  >;
  /**
   * The Saat Duka confirmation and decline rows read the Pemesanan module's own
   * state: the Tier 1 "Konfirmasi Lokasi terlambat" row (ticket 23), its Tier 1
   * "Saat Duka ditolak" row (ticket 24) and the Antrean Lokasi's open
   * confirmations. Never its tables.
   */
  pemesanan: Pick<Pemesanan, "konfirmasiLewatTenggat" | "antreanKonfirmasi" | "konfirmasiTerlambat" | "ditolak" | "saatDukaDitolak">;
  /** The Antrean Lokasi's "Petak Perlu Verifikasi" row counts the Denah's own (ticket 23). */
  inventory: Pick<Inventory, "jumlahPetakPerluVerifikasi">;
  /**
   * The Antrean's Tier 3 "Pencairan" row reads the Payouts module's own query
   * (ticket 32): one open row per recipient with the 2 Hari Kerja deadline the
   * item was given when it became due.
   */
  payouts: Pick<Payouts, "pencairanJatuhTempo">;
  /**
   * Every Akun holding Admin Platform, for the Tier 1 alerts' all-hands
   * escalation (ticket 28). Only identity knows who holds a role.
   */
  identity: Pick<Identity, "adminPlatformOf">;
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
  /**
   * When this occurrence of the row appeared — the instant its subject reached
   * the state the row reads, which is the same instant the row becomes open.
   * A row type whose alerting is timed must say so here: a Tier 1 alert escalates
   * by the minutes after this. Null when the row type does not know, and then
   * the row is announced but never escalated.
   */
  openedAt: Date | null;
}

/**
 * A row type that alerts (spec, Work Queues: Tier 1 today; Tier 2 shows without
 * alerts and Tier 3–4 never alert). Its absence on a row type is the whole rule
 * that keeps them quiet.
 */
export interface PeringatanAntrean {
  /**
   * True when the row's subject is a DKI TPU, so a row created outside
   * 06:00–18:00 WIB is announced at 06:00 instead of in the middle of the night
   * (spec: "Night TPU rows alert at 06:00").
   */
  tpu: boolean;
  /**
   * Minutes after the row was **announced** at which every Admin Platform is
   * alerted again about it, each of them once: 30 for a Tier 1 row nobody took
   * (Ambil), and 90 as well for Konfirmasi TPU Saat Duka (ticket 45 declares
   * that row type's own pair; nothing else escalates twice).
   */
  eskalasiMenit: number[];
}

/** A row type's declaration: tier, query and deadline rule (the query returns each open row already past its own deadline rule). */
export interface AntreanRowType {
  /** Stable across releases: also half of a row's Ambil and Catatan Internal key (with `subjectId`). */
  key: string;
  tier: AntreanTier;
  label: string;
  /** Every row of this type currently open, for `by` (Admin Platform; empty for anyone else, see each type). */
  rows(deps: AntreanRowDeps, by: Actor): Promise<RawAntreanRow[]>;
  /** Present when this type alerts, and then when and how far it escalates; absent on a type that never alerts. */
  peringatan?: PeringatanAntrean;
}
