/**
 * Work Queues: the Antrean (spec, domain module 14; ticket 17). A projection
 * of domain state: each row type (`./registry.ts`) is a query plus a deadline
 * rule, and rows close themselves when the state they read moves on. This
 * ticket delivers the framework plus its first three, Tier 4, row types
 * (`./tier4-lokasi-rows.ts`, `./tier4-tugas-lapangan-row.ts`); Tier 1–3 types
 * arrive with their own tickets and need no change here beyond the registry.
 *
 * Owns tables: antrean_ambil (Ambil claims), catatan_internal (Catatan
 * Internal threads).
 *
 * Every write (Ambil, Catatan Internal) records an Entri Audit through the
 * Audit Log module in the same transaction, and re-checks `authorize` itself.
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Fieldwork } from "@/domain/fieldwork";
import type { Actor } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Clock } from "@/ports/clock";
import { ambilRow, type AmbilRowResult } from "./ambil";
import { antrean, antreanCounters, type AntreanCounters, type AntreanRow } from "./antrean";
import {
  catatanInternalFor,
  tambahCatatanInternal,
  type CatatanInternal,
  type CatatanInternalInput,
  type TambahCatatanInternalResult,
} from "./catatan-internal";

export { catatanInternalInputSchema, type CatatanInternal, type CatatanInternalInput, type TambahCatatanInternalResult } from "./catatan-internal";
export type { AmbilRowResult } from "./ambil";
export { rowKeyOf, type AntreanCounters, type AntreanRow } from "./antrean";
export { antreanRowTypes } from "./registry";
export type { AntreanRowDeps, AntreanRowType, AntreanTier, RawAntreanRow } from "./row-types";

export interface QueuesModuleDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** The Antrean's Tier 4 Lokasi rows read every Lokasi Mitra's status and publish/recheck timestamps. */
  lokasi: Pick<Lokasi, "allLokasiMitra">;
  /** The Antrean's Tier 4 rows read every Tugas Lapangan. */
  fieldwork: Pick<Fieldwork, "allTugasLapangan">;
}

export interface Queues {
  /** Every open Antrean row, sorted by tier then deadline (Admin Platform only; empty for anyone else). */
  antrean(by: Actor): Promise<AntreanRow[]>;
  /** The counter strip (spec, story 144): counters with no source yet show 0, filled in by later tickets. */
  counters(by: Actor): Promise<AntreanCounters>;
  /** Any Admin Platform takes (Ambil) a row, replacing any earlier claim; logged in the Audit Log. */
  ambilRow(by: Actor, input: { type: string; subjectId: string }): Promise<AmbilRowResult>;
  /** Admin Platform adds a Catatan Internal on any row or order; audited, never shown to the Pemesan, Mitra Jasa or Admin Lokasi. */
  tambahCatatanInternal(by: Actor, input: CatatanInternalInput): Promise<TambahCatatanInternalResult>;
  /** Every Catatan Internal on one subject, oldest first (Admin Platform only). */
  catatanInternal(by: Actor, subjectKind: string, subjectId: string): Promise<CatatanInternal[]>;
}

export function createQueues(deps: QueuesModuleDeps): Queues {
  return {
    antrean: (by) => antrean(deps, by),
    counters: (by) => antreanCounters(deps, by),
    ambilRow: (by, input) => ambilRow(deps, by, input),
    tambahCatatanInternal: (by, input) => tambahCatatanInternal(deps, by, input),
    catatanInternal: (by, subjectKind, subjectId) => catatanInternalFor(deps, by, subjectKind, subjectId),
  };
}
