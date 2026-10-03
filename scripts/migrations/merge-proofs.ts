/**
 * The merge-time proofs for a renumbered migration (docs/agents/orchestration.md,
 * "Renumbering a ticket's migration at merge time" and "The third proof"):
 *
 *   npx tsx scripts/migrations/merge-proofs.ts <aside-dir>
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { unmarkedDestructiveStatements, type DestructiveStatement } from "./destructive-ddl";

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
  /** The statements both sides have appear in the same relative order (a re-appended hand-written block may sit elsewhere). */
  ordered: boolean;
  /** Statements only the branch has: hand-written blocks (ticket 39's backfill) to re-append. */
  handWritten: string[];
  /** Statements only the generator produced (or produced more often): a sign the restore went wrong (two tickets in one file). */
  unexpected: string[];
};

function statements(sql: string): string[] {
  return sql
    .replace(/\r\n/g, "\n")
    .split("--> statement-breakpoint")
    .map((s) => s.trim().replace(/\s+/g, " "))
    .filter(Boolean);
}

/** `from` minus one occurrence per element of `taken`, keeping order. */
function without(from: string[], taken: string[]): string[] {
  const left = [...taken];
  return from.filter((s) => {
    const at = left.indexOf(s);
    if (at < 0) return true;
    left.splice(at, 1);
    return false;
  });
}

export function compareMigrationSql(generated: string, branch: string): SqlComparison {
  const gen = statements(generated);
  const own = statements(branch);
  const handWritten = without(own, gen);
  const unexpected = without(gen, own);
  const sharedGen = without(gen, unexpected);
  const sharedOwn = without(own, handWritten);
  const ordered = sharedGen.every((s, i) => s === sharedOwn[i]);
  const identical = handWritten.length === 0 && unexpected.length === 0 && ordered && gen.every((s, i) => s === own[i]);
  return { identical, ordered, handWritten, unexpected };
}

export type MergeProofsOptions = {
  drizzleDir: string;
  /** Where renumber-merge copied the branch's own SQL. */
  asideDir: string;
  /** The migration files the regenerate produced (not in the base). */
  newFiles: string[];
  /** Runs `npm run db:generate` and returns its output. */
  generate: () => string;
  /** Main's `drizzle/meta/*_snapshot.json` by file name (the CLI reads them from the base commit); each must survive byte-equal. */
  baseSnapshots?: Record<string, string>;
};

export type MergeProofsReport = {
  ok: boolean;
  /** Hand-written blocks of the branch the regenerated files lack: re-append them, then rerun the proofs. */
  reappend: string[];
  /** Snapshots of main that are missing or changed in the merged tree (the 32-merge deletion the third proof catches). */
  baseSnapshotProblems: string[];
  sql: { file: string; comparison: SqlComparison }[];
  secondGenerateClean: boolean;
  chain: SnapshotChain;
  /** Unmarked destructive DDL in the new files (check-destructive-ddl.ts). */
  destructive: (DestructiveStatement & { file: string })[];
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
  const sqlOk = options.newFiles.length === aside.length && sql.every((s) => s.comparison.unexpected.length === 0 && s.comparison.ordered);
  const destructive = options.newFiles.flatMap((file) => unmarkedDestructiveStatements(readFileSync(file, "utf8")).map((d) => ({ ...d, file })));
  const baseSnapshotProblems = Object.entries(options.baseSnapshots ?? {}).flatMap(([name, content]) => {
    const file = path.join(options.drizzleDir, "meta", name);
    if (!existsSync(file)) return [`${name}: missing`];
    return readFileSync(file, "utf8") === content ? [] : [`${name}: differs from main's`];
  });
  const reappend = sql.flatMap((s) => s.comparison.handWritten);
  return { ok: sqlOk && reappend.length === 0 && baseSnapshotProblems.length === 0 && secondGenerateClean && chain.unexpected.length === 0 && destructive.length === 0, reappend, baseSnapshotProblems, sql, secondGenerateClean, chain, destructive };
}

function main(): void {
  const [asideDir, baseRef = "HEAD"] = process.argv.slice(2);
  if (!asideDir) {
    console.error("usage: npx tsx scripts/migrations/merge-proofs.ts <aside-dir> [base-ref]");
    process.exit(2);
  }
  const inBase = new Set(
    execFileSync("git", ["ls-tree", "-r", "--name-only", baseRef, "--", "drizzle"], { encoding: "utf8" }).split("\n").filter(Boolean),
  );
  const newFiles = readdirSync("drizzle")
    .filter((f) => f.endsWith(".sql") && !inBase.has(`drizzle/${f}`))
    .map((f) => path.join("drizzle", f));
  const report = runMergeProofs({
    drizzleDir: "drizzle",
    asideDir,
    newFiles,
    generate: () => {
      try {
        return execFileSync("npm", ["run", "db:generate"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      } catch (error) {
        const e = error as { stdout?: string; stderr?: string };
        return `${e.stdout ?? ""}${e.stderr ?? ""}`;
      }
    },
  });

  for (const { file, comparison } of report.sql) {
    console.log(`1. ${file}: ${comparison.identical ? "statement-identical to the branch's SQL" : "DIFFERS from the branch's SQL"}`);
    for (const block of comparison.handWritten) console.log(`   hand-written in the branch, RE-APPEND to ${file}: ${block}`);
    for (const stmt of comparison.unexpected) console.log(`   UNEXPECTED generated statement (two tickets in one file?): ${stmt}`);
  }
  console.log(`2. second db:generate: ${report.secondGenerateClean ? "no schema changes" : "STILL FINDS CHANGES"}`);
  console.log(`3. snapshot chain: dangling ${report.chain.dangling.join(",") || "none"}; unexpected ${report.chain.unexpected.join(",") || "none"}`);
  for (const d of report.destructive) console.log(`   ${d.file}:${d.line}: ${d.reason} without "-- contract: <reason>": ${d.statement}`);
  console.log(report.ok ? "PROOFS OK" : report.reappend.length > 0 ? "RE-APPEND the hand-written block(s) above, then rerun the proofs" : "PROOFS FAILED");
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) main();
