/**
 * The merge-time proofs for a renumbered migration (docs/agents/orchestration.md,
 * "Renumbering a ticket's migration at merge time" and "The third proof"):
 *
 *   npx tsx scripts/migrations/merge-proofs.ts <aside-dir> [base-ref]
 *
 * `<aside-dir>` is the folder renumber-merge.ts printed; `[base-ref]` (default HEAD) is the merge worktree's own commit.
 * Exits 0 only when every proof holds; 1 on a failed proof or while a hand-written block is missing; 64 on bad arguments.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { refSchema } from "./renumber-merge";
import { unmarkedDestructiveStatements, type DestructiveStatement } from "./destructive-ddl";

/** Pre-existing gaps in the chain, left by earlier renumberings. Any other dangling prevId is a defect. */
export const KNOWN_SNAPSHOT_GAPS = ["0018", "0021", "0024"];
const ROOT_PREV_ID = "00000000-0000-0000-0000-000000000000";

const snapshotSchema = z.object({ id: z.string(), prevId: z.string() });

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
    .map((f) => {
      const parsed = snapshotSchema.safeParse(JSON.parse(readFileSync(path.join(metaDir, f), "utf8")));
      if (!parsed.success) throw new Error(`${f}: not a snapshot with a string id and prevId`);
      return { number: f.slice(0, 4), ...parsed.data };
    });
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

const argsSchema = z.tuple([z.string().min(1)], refSchema).refine((a) => a.length <= 2);

export type ProofsCliIo = { cwd: string; out: (line: string) => void; err: (line: string) => void; generate: () => string };

/** The command line as a function of its arguments, returning the exit code. */
export function mergeProofsCli(argv: string[], io: ProofsCliIo): number {
  const args = argsSchema.safeParse(argv);
  if (!args.success || !existsSync(args.data[0])) {
    io.err("usage: npx tsx scripts/migrations/merge-proofs.ts <aside-dir> [base-ref]  (the folder renumber-merge printed; a ref never starts with '-')");
    return 64;
  }
  const [asideDir, baseRef = "HEAD"] = args.data;
  const inBase = new Set(
    execFileSync("git", ["ls-tree", "-r", "--name-only", baseRef, "--", "drizzle"], { cwd: io.cwd, encoding: "utf8" }).split("\n").filter(Boolean),
  );
  const drizzleDir = path.join(io.cwd, "drizzle");
  const newFiles = readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql") && !inBase.has(`drizzle/${f}`))
    .map((f) => path.join(drizzleDir, f));
  const baseSnapshots = Object.fromEntries(
    [...inBase]
      .filter((f) => f.endsWith("_snapshot.json"))
      .map((f) => [path.basename(f), execFileSync("git", ["show", `${baseRef}:${f}`], { cwd: io.cwd, encoding: "utf8" })]),
  );
  const report = runMergeProofs({ drizzleDir, asideDir, newFiles, generate: io.generate, baseSnapshots });
  for (const problem of report.baseSnapshotProblems) io.out(`main's snapshot ${problem}`);
  for (const block of report.reappend) io.out(`hand-written in the branch, RE-APPEND to the regenerated file: ${block}`);
  io.out(report.ok ? "PROOFS OK" : report.reappend.length > 0 ? "RE-APPEND the hand-written block(s) above, then rerun the proofs" : "PROOFS FAILED");
  return report.ok ? 0 : 1;
}

function npmGenerate(cwd: string): string {
  try {
    return execFileSync("npm", ["run", "db:generate"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    return `${e.stdout ?? ""}${e.stderr ?? ""}`;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cwd = process.cwd();
  process.exitCode = mergeProofsCli(process.argv.slice(2), { cwd, out: console.log, err: console.error, generate: () => npmGenerate(cwd) });
}
