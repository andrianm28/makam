/**
 * The Antrean itself (spec, Work Queues; ticket 17): every registered row
 * type's open rows, decorated with their Ambil claim and sorted by tier then
 * deadline. Rows are never stored; this runs every registered type's query on
 * each read.
 */
import { inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { antreanResource, writeRefusal, type Actor } from "@/domain/identity";
import type { Clock } from "@/ports/clock";
import { antreanRowTypes } from "./registry";
import { KELUHAN_ROW_TYPE } from "./tier1-keluhan-row";
import type { AntreanRowDeps, AntreanTier } from "./row-types";
import { antreanAmbil } from "./schema";

export interface AntreanRow {
  /** The row type's key (registry, `./registry.ts`): also half of its Ambil / Catatan Internal key, with `subjectId`. */
  type: string;
  tier: AntreanTier;
  label: string;
  subjectKind: string;
  subjectId: string;
  subjectLabel: string;
  href: string;
  deadline: Date | null;
  /** True once `deadline` has passed (the Clock's now); always false for a row with no deadline. */
  pastDeadline: boolean;
  /** Only a Tier 1 row alerts (ticket 28); Tier 2 shows without one and Tier 3 and 4 never alert (spec, Work Queues). */
  alerts: boolean;
  ambil: { accountId: string; claimedAt: Date } | null;
}

export interface QueuesAntreanDeps extends AntreanRowDeps {
  db: Database;
  clock: Clock;
}

/** Every open Antrean row, Admin Platform only (empty for anyone else), sorted by tier then deadline (no deadline sorts last within its tier). */
export async function antrean(deps: QueuesAntreanDeps, by: Actor): Promise<AntreanRow[]> {
  if (writeRefusal(by, "antrean.lihat", antreanResource())) return [];
  const now = deps.clock.now();

  const byType = await Promise.all(
    antreanRowTypes.map(async (rowType) => {
      const rows = await rowType.rows(deps, by);
      return rows.map((row) => ({ ...row, type: rowType.key, tier: rowType.tier, label: rowType.label }));
    }),
  );
  const raw = byType.flat();
  if (raw.length === 0) return [];

  const rowKeys = raw.map((row) => rowKeyOf(row.type, row.subjectId));
  const claims = await deps.db.select().from(antreanAmbil).where(inArray(antreanAmbil.rowKey, rowKeys));
  const claimByKey = new Map(claims.map((claim) => [claim.rowKey, claim]));

  const rows: AntreanRow[] = raw.map((row) => {
    const claim = claimByKey.get(rowKeyOf(row.type, row.subjectId));
    return {
      ...row,
      pastDeadline: row.deadline !== null && row.deadline.getTime() < now.getTime(),
      alerts: row.tier === 1,
      ambil: claim ? { accountId: claim.claimedByAccountId, claimedAt: claim.claimedAt } : null,
    };
  });

  rows.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const deadlineA = a.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
    const deadlineB = b.deadline?.getTime() ?? Number.POSITIVE_INFINITY;
    if (deadlineA !== deadlineB) return deadlineA - deadlineB;
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return a.subjectId.localeCompare(b.subjectId);
  });
  return rows;
}

/** The Antrean's own key for one row: shared by `antrean`, Ambil and (as `subjectKind`/`subjectId`) Catatan Internal. */
export function rowKeyOf(type: string, subjectId: string): string {
  return `${type}:${subjectId}`;
}

export interface AntreanCounters {
  /** Recipients with a transfer waiting (the Tier 3 Pencairan rows; ticket 32). */
  pencairanDue: number;
  /** Overdue Tagihan (billing module; ticket 29 fills this in). */
  tagihanOverdue: number;
  /** Terlambat jobs (layanan module; ticket 51 fills this in). */
  terlambatJobs: number;
  /** Keluhan waiting for Admin Platform's decision: the Tier 1 Keluhan rows (ticket 51). */
  keluhanOpen: number;
  /** Every Antrean row past its deadline, any tier. */
  pastDeadline: number;
}

/** The counter strip (spec, story 144): counters with no source yet show 0, filled in by their own tickets. */
export async function antreanCounters(deps: QueuesAntreanDeps, by: Actor): Promise<AntreanCounters> {
  const rows = await antrean(deps, by);
  return {
    // The Tier 3 Pencairan rows themselves are the count: one per recipient with a
    // transfer waiting, which is what "Pencairan due" means to Admin Platform.
    pencairanDue: rows.filter((row) => row.type === "pencairan").length,
    tagihanOverdue: 0,
    terlambatJobs: 0,
    // The Tier 1 Keluhan rows themselves are the count, as the Tier 3 Pencairan rows are for Pencairan due.
    keluhanOpen: rows.filter((row) => row.type === KELUHAN_ROW_TYPE).length,
    pastDeadline: rows.filter((row) => row.pastDeadline).length,
  };
}
