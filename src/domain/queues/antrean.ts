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
import type { AntreanRowDeps, AntreanTier } from "./row-types";
import { antreanAmbil } from "./schema";

/**
 * The actor the Antrean is read with when nobody is signed in: the alert tick
 * (`./peringatan.ts`) runs on the worker's schedule, not on somebody opening the
 * page, and it has to see every row an Admin Platform sees.
 *
 * It is **not an identity**. No Akun, no Email Terverifikasi, no phone number,
 * no session and no Lokasi Mitra come out of it: the ids are empty strings
 * because no Akun has one, and the roles are the one the read checks (the TPU
 * list asks of its reader whether it is Admin Platform). It exists because a row
 * type's query takes an actor, and every row type either ignores it or forwards
 * it to a read that only asks for a role.
 */
export const actorAntrian: Actor = {
  accountId: "",
  email: "",
  phoneNumber: null,
  roles: ["pemesan", "admin_platform"],
  lokasiIds: [],
  totp: "lolos",
  sessionId: "",
};

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
  /**
   * When this occurrence of the row appeared — its own subject's instant, as its
   * row type reported it. Null when the type does not say; a Tier 1 alert
   * escalates by the minutes after this, and a type that alerts must say it.
   */
  openedAt: Date | null;
  /** True once `deadline` has passed (the Clock's now); always false for a row with no deadline. */
  pastDeadline: boolean;
  /**
   * True when the row type declares an alert (Tier 1 today: Tier 2 shows in the
   * Antrean without alerting, and Tier 3–4 never alert, spec Work Queues). It is
   * the row type's own declaration, not the tier, that decides this.
   */
  alerts: boolean;
  ambil: { accountId: string; claimedAt: Date } | null;
}

export interface QueuesAntreanDeps extends AntreanRowDeps {
  db: Database;
  clock: Clock;
}

/**
 * Every open Antrean row, sorted by tier then deadline, with no actor behind it:
 * the projection itself, for the alert tick (`./peringatan.ts`), which runs on
 * the worker's schedule rather than on somebody opening the Antrean. A page
 * reads it through `antrean`, which is the same projection behind the
 * Admin Platform check.
 */
export async function barisAntrian(deps: QueuesAntreanDeps): Promise<AntreanRow[]> {
  const now = deps.clock.now();

  const byType = await Promise.all(
    antreanRowTypes.map(async (rowType) => {
      const rows = await rowType.rows(deps, actorAntrian);
      return rows.map((row) => ({
        ...row,
        type: rowType.key,
        tier: rowType.tier,
        label: rowType.label,
        alerts: rowType.peringatan !== undefined,
      }));
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

/** Every open Antrean row, Admin Platform only (empty for anyone else), sorted by tier then deadline (no deadline sorts last within its tier). */
export async function antrean(deps: QueuesAntreanDeps, by: Actor): Promise<AntreanRow[]> {
  if (writeRefusal(by, "antrean.lihat", antreanResource())) return [];
  return barisAntrian(deps);
}

/** The Antrean's own key for one row: shared by `antrean`, Ambil and `antrean_peringatan` (with `subjectId`). */
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
  /** Open Keluhan (layanan module; ticket 51 fills this in). */
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
    keluhanOpen: 0,
    pastDeadline: rows.filter((row) => row.pastDeadline).length,
  };
}
