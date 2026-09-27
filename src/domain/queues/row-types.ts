/**
 * The Antrean's row-type registry (spec, Work Queues; ticket 17): each row
 * type is a query plus a deadline rule and the link to its subject, so adding
 * one needs no change to the Antrean UI or aggregator (`./antrean.ts`).
 */
import type { Billing } from "@/domain/billing";
import type { Fieldwork } from "@/domain/fieldwork";
import type { Actor } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Clock } from "@/ports/clock";

export type AntreanTier = 1 | 2 | 3 | 4;

/** What a row type needs to run its query: only the neighbour modules' own public reads, never their tables. */
export interface AntreanRowDeps {
  clock: Clock;
  lokasi: Pick<Lokasi, "allLokasiMitra">;
  fieldwork: Pick<Fieldwork, "allTugasLapangan">;
  billing: Pick<Billing, "pembayaranPerluDitinjau">;
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
