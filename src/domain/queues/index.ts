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
 * Internal threads), antrean_bertugas (who is on duty) and antrean_peringatan
 * (which Tier 1 alert a row has already had; ticket 28).
 *
 * Ticket 28 added what the Antrean's rows do about time rather than about work:
 * Bertugas (who is on duty for the Tier 1 alerts, with its 18:00 WIB / 12 h
 * auto-off), the Peringatan Staf a Tier 1 row raises and its 30 / 90 minute
 * escalations, and the red banner's count of untaken Tier 1 rows. Both are ticks,
 * registered in the Scheduler and composed in the worker, and both are idempotent
 * through an insert that claims what they have already done.
 *
 * Every write (Ambil, Catatan Internal, Bertugas) records an Entri Audit through
 * the Audit Log module in the same transaction, and re-checks `authorize` itself.
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Fieldwork } from "@/domain/fieldwork";
import { antreanResource, writeRefusal, type Actor, type Identity } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Inventory } from "@/domain/inventory";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan } from "@/domain/pemesanan";
import type { Payouts } from "@/domain/payouts";
import type { Clock } from "@/ports/clock";
import { ambilRow, type AmbilRowInput, type AmbilRowResult } from "./ambil";
import { antrean, antreanCounters, type AntreanCounters, type AntreanRow, type QueuesAntreanDeps } from "./antrean";
import { antreanLokasi, type AntreanLokasiAntrean } from "./antrean-lokasi";
import {
  matikanBertugas,
  nyalakanBertugas,
  petugasBertugas,
  tickBertugasMati,
  type HasilBertugasTick,
  type MatikanBertugasInput,
  type MatikanBertugasResult,
  type NyalakanBertugasResult,
  type PetugasBertugas,
} from "./bertugas";
import {
  catatanInternalFor,
  tambahCatatanInternal,
  type CatatanInternal,
  type CatatanInternalInput,
  type TambahCatatanInternalResult,
} from "./catatan-internal";
import { tickPeringatanAntrean, type HasilPeringatanTick } from "./peringatan";

export {
  catatanInternalInputSchema,
  type CatatanInternal,
  type CatatanInternalInput,
  type TambahCatatanInternalResult,
} from "./catatan-internal";
export type { AmbilRowInput, AmbilRowResult } from "./ambil";
export { rowKeyOf, type AntreanCounters, type AntreanRow } from "./antrean";
export {
  antreanLokasiRowTypes,
  type AntreanLokasiGrup,
  type AntreanLokasiRow,
  type AntreanLokasiRowType,
} from "./antrean-lokasi";
export { antreanRowTypes } from "./registry";
export { TPU_FLAG_STALE_DAYS } from "./tier4-tpu-row";
export type { AntreanRowDeps, AntreanRowType, AntreanTier, PeringatanAntrean, RawAntreanRow } from "./row-types";
export {
  JAM_MAKS_BERTUGAS,
  matikanBertugasInputSchema,
  type HasilBertugasTick,
  type MatikanBertugasInput,
  type MatikanBertugasResult,
  type NyalakanBertugasResult,
  type PetugasBertugas,
} from "./bertugas";
export { TAHAP_UMUM, diumumkanPada, tahapPeringatan, type HasilPeringatanTick, type PeringatanTerkirim, type TahapPeringatan } from "./peringatan";

export interface QueuesModuleDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** The Antrean's Tier 4 Lokasi rows read every Lokasi Mitra's status and publish/recheck timestamps, and the Tier 4 TPU flag row every DKI TPU's flag date. */
  lokasi: Pick<Lokasi, "allLokasiMitra" | "tpuDkiList">;
  /** The Antrean's Tier 4 rows read every Tugas Lapangan. */
  fieldwork: Pick<Fieldwork, "allTugasLapangan">;
  /** The Antrean's Tier 2 Pembayaran Perlu Ditinjau row reads Billing's own query. */
  billing: Pick<Billing, "pembayaranPerluDitinjau">;
  /** The Antrean's Tier 2 Telepon Pemesan row reads the open call rows, and its Tier 1 alerts the Perangkat Push and the Peringatan Staf (ticket 28). */
  notifications: Pick<
    Notifications,
    "teleponPemesanTerbuka" | "teleponPemesanTercatat" | "sendStaffAlert" | "pushDevices"
  >;
  /** The confirmation rows read the Pemesanan module's own state (the Tier 1 late row, the Antrean Lokasi). */
  pemesanan: Pick<
    Pemesanan,
    "konfirmasiLewatTenggat" | "antreanKonfirmasi" | "konfirmasiTerlambat" | "ditolak" | "saatDukaDitolak"
  >;
  /** The Antrean Lokasi's "Petak Perlu Verifikasi" row counts the Denah's own Petak. */
  inventory: Pick<Inventory, "jumlahPetakPerluVerifikasi">;
  /** The Antrean's Tier 3 Pencairan row reads the Payouts module's own query. */
  payouts: Pick<Payouts, "pencairanJatuhTempo">;
  /** The Tier 1 alerts' all-hands escalation reads every Akun holding Admin Platform (ticket 28). */
  identity: Pick<Identity, "adminPlatformOf">;
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
  ambilRow(by: Actor, input: AmbilRowInput): Promise<AmbilRowResult>;
  /** Admin Platform adds a Catatan Internal on any row or order; audited, never shown to the Pemesan, Mitra Jasa or Admin Lokasi. */
  tambahCatatanInternal(by: Actor, input: CatatanInternalInput): Promise<TambahCatatanInternalResult>;
  /** Every Catatan Internal on one subject, oldest first (Admin Platform only). */
  catatanInternal(by: Actor, subjectKind: string, subjectId: string): Promise<CatatanInternal[]>;
  /**
   * The Tier 1 rows nobody has taken (Ambil) while they are open, for the red
   * banner in the header of every staff page (spec, Work Queues; ticket 28).
   * Zero for anyone but an Admin Platform.
   */
  tier1BelumAmbil(by: Actor): Promise<number>;
  /** Who is Bertugas now, oldest first: what the Antrean header lists (ticket 28). */
  petugasBertugas(by: Actor): Promise<PetugasBertugas[]>;
  /** An Admin Platform switches itself Bertugas; refused without an active Perangkat Push (ADR 0004); audited. */
  nyalakanBertugas(by: Actor): Promise<NyalakanBertugasResult>;
  /**
   * An Admin Platform comes off duty by hand, deciding for each Ambil claim it
   * still holds: release it, or hand it over with a Catatan Internal. A claim
   * with no decision refuses the whole thing; audited.
   */
  matikanBertugas(by: Actor, input: MatikanBertugasInput): Promise<MatikanBertugasResult>;
  /**
   * Scheduler tick (ticket 28): announces each open Tier 1 row, and re-alerts
   * everyone about the ones that have gone an escalation time untaken.
   * Idempotent.
   */
  tickPeringatan(now: Date): Promise<HasilPeringatanTick>;
  /** Scheduler tick (ticket 28): ends a Bertugas duty at 18:00 WIB or 12 h, leaving its claims and noting the event. Idempotent. */
  tickBertugas(now: Date): Promise<HasilBertugasTick>;
}

export function createQueues(deps: QueuesModuleDeps): Queues {
  return {
    antrean: (by) => antrean(deps, by),
    counters: (by) => antreanCounters(deps, by),
    antreanLokasi: (by, lokasiId) => antreanLokasi(deps, by, lokasiId),
    ambilRow: (by, input) => ambilRow(deps, by, input),
    tambahCatatanInternal: (by, input) => tambahCatatanInternal(deps, by, input),
    catatanInternal: (by, subjectKind, subjectId) => catatanInternalFor(deps, by, subjectKind, subjectId),
    tier1BelumAmbil: (by) => tier1BelumAmbil(deps, by),
    petugasBertugas: (by) => petugasBertugasFor(deps, by),
    nyalakanBertugas: (by) => nyalakanBertugas(deps, by),
    matikanBertugas: (by, input) => matikanBertugas(deps, by, input),
    tickPeringatan: (now) => tickPeringatanAntrean(deps, now),
    tickBertugas: (now) => tickBertugasMati(deps, now),
  };
}

/**
 * How many Tier 1 rows are open and untaken (Ambil): the red banner in the
 * header of every staff page (spec, Work Queues; ticket 28). Only an Admin
 * Platform may see the Antrean at all, so for anyone else this is 0.
 */
async function tier1BelumAmbil(deps: QueuesAntreanDeps, by: Actor): Promise<number> {
  const baris = await antrean(deps, by);
  return baris.filter((satu) => satu.tier === 1 && satu.ambil === null).length;
}

/** Who is Bertugas now, for the Antrean header; Admin Platform only, empty for anyone else. */
async function petugasBertugasFor(deps: QueuesAntreanDeps, by: Actor): Promise<PetugasBertugas[]> {
  if (writeRefusal(by, "antrean.lihat", antreanResource())) return [];
  return petugasBertugas(deps);
}
