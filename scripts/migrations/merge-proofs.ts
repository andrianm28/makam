/**
 * The merge-time proofs for a renumbered migration (docs/agents/orchestration.md,
 * "Renumbering a ticket's migration at merge time" and "The third proof"):
 *
 *   npx tsx scripts/migrations/merge-proofs.ts <aside-dir>
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Pre-existing gaps in the chain, left by earlier renumberings. Any other dangling prevId is a defect. */
export const KNOWN_SNAPSHOT_GAPS = ["0018", "0021", "0024"];
const ROOT_PREV_ID = "00000000-0000-0000-0000-000000000000";

export type SnapshotChain = {
  /** Snapshot numbers whose prevId is not another snapshot's id, sorted. */
  dangling: string[];
  /** The dangling ones that are not a known gap. */
  unexpected: string[];
};

export function checkSnapshotChain(drizzleDir: string): SnapshotChain {
  const metaDir = path.join(drizzleDir, "meta");
  const snapshots = readdirSync(metaDir)
    .filter((f) => f.endsWith("_snapshot.json"))
    .map((f) => ({ number: f.slice(0, 4), ...(JSON.parse(readFileSync(path.join(metaDir, f), "utf8")) as { id: string; prevId: string }) }));
  const ids = new Set(snapshots.map((s) => s.id));
  const dangling = snapshots
    .filter((s) => s.prevId !== ROOT_PREV_ID && !ids.has(s.prevId))
    .map((s) => s.number)
    .sort();
  return { dangling, unexpected: dangling.filter((n) => !KNOWN_SNAPSHOT_GAPS.includes(n)) };
}

export type SqlComparison = {
  /** Every statement matches, in order, with nothing added or missing. */
  identical: boolean;
  /** Statements only the branch has: hand-written blocks (ticket 39's backfill) to re-append. */
  handWritten: string[];
  /** Statements only the generator produced: a sign the restore went wrong (two tickets in one file). */
  unexpected: string[];
};

function statements(sql: string): string[] {
  return sql
    .replace(/\r\n/g, "\n")
    .split("--> statement-breakpoint")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

export function compareMigrationSql(generated: string, branch: string): SqlComparison {
  const gen = statements(generated);
  const own = statements(branch);
  const handWritten = own.filter((s) => !gen.includes(s));
  const unexpected = gen.filter((s) => !own.includes(s));
  const identical = handWritten.length === 0 && unexpected.length === 0 && gen.every((s, i) => s === own[i]);
  return { identical, handWritten, unexpected };
}

export type MergeProofsOptions = {
  drizzleDir: string;
  /** Where renumber-merge copied the branch's own SQL. */
  asideDir: string;
  /** The migration files the regenerate produced (not in the base). */
  newFiles: string[];
  /** Runs `npm run db:generate` and returns its output. */
  generate: () => string;
};

export type MergeProofsReport = {
  ok: boolean;
  sql: { file: string; comparison: SqlComparison }[];
  secondGenerateClean: boolean;
  chain: SnapshotChain;
};

const NOTHING_TO_MIGRATE = /nothing to migrate|no schema changes/i;

export function runMergeProofs(options: MergeProofsOptions): MergeProofsReport {
  const aside = readdirSync(options.asideDir).filter((f) => f.endsWith(".sql")).sort();
  const sql = [...options.newFiles].sort().map((file, i) => ({
    file,
    comparison: compareMigrationSql(
      readFileSync(file, "utf8"),
      aside[i] ? readFileSync(path.join(options.asideDir, aside[i]), "utf8") : "",
    ),
  }));
  const secondGenerateClean = NOTHING_TO_MIGRATE.test(options.generate());
  const chain = checkSnapshotChain(options.drizzleDir);
  const sqlOk = options.newFiles.length === aside.length && sql.every((s) => s.comparison.unexpected.length === 0);
  return { ok: sqlOk && secondGenerateClean && chain.unexpected.length === 0, sql, secondGenerateClean, chain };
}
