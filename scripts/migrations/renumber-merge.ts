/**
 * Merge-time renumbering of a branch's migration (docs/agents/orchestration.md,
 * "Renumbering a ticket's migration at merge time"). Run in the merge worktree:
 *
 *   npx tsx scripts/migrations/renumber-merge.ts <branch-ref> [base-ref]
 *
 * It starts `git merge --no-commit --no-ff <branch>`, sets the branch's added
 * `drizzle/*.sql` aside, drops the branch's migrations and snapshots from the
 * merge and restores the base's journal and snapshots, so `npm run db:generate`
 * regenerates the branch's schema change under the next free number.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

export type RenumberOptions = {
  cwd: string;
  branchRef: string;
  /** The merge worktree's own commit; default HEAD. */
  baseRef?: string;
  /** Where the branch's SQL is copied; default a fresh temp directory. */
  asideDir?: string;
};

export type RenumberResult = {
  asideDir: string;
  /** The branch's added migration files, as copied into `asideDir`. */
  setAside: string[];
  /** Ticket files (`.scratch/**\/*.md`) whose conflict was resolved by keeping both sides. */
  unionResolved: string[];
  /** Any other conflict: reported, left unresolved, never touched. */
  codeConflicts: string[];
};

/** Keeps both sides of every conflict hunk (ours, then theirs); the diff3 base section is dropped. */
export function unionConflictMarkers(text: string): string {
  return text.replace(/<<<<<<< [^\n]*\n([\s\S]*?)(?:\|\|\|\|\|\|\| [^\n]*\n[\s\S]*?)?=======\n([\s\S]*?)>>>>>>> [^\n]*\n/g, (_m, ours: string, theirs: string) => ours + theirs);
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function lines(out: string): string[] {
  return out.split("\n").filter(Boolean);
}

function mergeInProgress(cwd: string): boolean {
  try {
    git(cwd, ["rev-parse", "-q", "--verify", "MERGE_HEAD"]);
    return true;
  } catch {
    return false;
  }
}

/** Resolves a ref to a commit id; `--end-of-options` keeps a ref that looks like an option from being read as one. */
function resolveCommit(cwd: string, ref: string): string {
  try {
    return git(cwd, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
  } catch {
    throw new Error(`"${ref}" is not a commit in this repository`);
  }
}

export function renumberForMerge(options: RenumberOptions): RenumberResult {
  const { cwd } = options;
  const baseRef = options.baseRef ?? "HEAD";
  if (git(cwd, ["status", "--porcelain"]).trim() !== "") {
    throw new Error("the merge worktree has uncommitted changes; commit or stash them first (the helper deletes and restores drizzle paths)");
  }
  const base = resolveCommit(cwd, baseRef);
  const branchRef = resolveCommit(cwd, options.branchRef);
  const asideDir = options.asideDir ?? mkdtempSync(path.join(tmpdir(), "makam-mig-aside-"));
  mkdirSync(asideDir, { recursive: true });

  const added = lines(git(cwd, ["diff", "--name-only", "--diff-filter=A", `${base}...${branchRef}`, "--", "drizzle/*.sql"]));
  const setAside: string[] = [];
  for (const file of added) {
    const target = path.join(asideDir, path.basename(file));
    writeFileSync(target, git(cwd, ["show", `${branchRef}:${file}`]));
    setAside.push(target);
  }
  const snapshots = lines(git(cwd, ["diff", "--name-only", `${base}...${branchRef}`, "--", "drizzle/meta/*_snapshot.json"]));

  let mergeError: unknown;
  try {
    git(cwd, ["merge", "--no-commit", "--no-ff", branchRef]);
  } catch (error) {
    mergeError = error; // conflicts are expected and leave MERGE_HEAD; anything else is rethrown below
  }
  if (mergeError !== undefined && !mergeInProgress(cwd)) throw mergeError;

  const unionResolved: string[] = [];
  const codeConflicts: string[] = [];
  for (const file of lines(git(cwd, ["diff", "--name-only", "--diff-filter=U"]))) {
    if (/^\.scratch\/.*\.md$/.test(file)) {
      writeFileSync(path.join(cwd, file), unionConflictMarkers(readFileSync(path.join(cwd, file), "utf8")));
      git(cwd, ["add", "--", file]);
      unionResolved.push(file);
    } else if (!file.startsWith("drizzle/")) {
      codeConflicts.push(file);
    }
  }

  // `git checkout <ref> -- <path>` on a path that is still unmerged does not restore it
  // (the silent failure in the orchestration manual), so clear every unmerged drizzle path
  // from the index first, then restore main's copies by name and verify them.
  const unmerged = lines(git(cwd, ["diff", "--name-only", "--diff-filter=U", "--", "drizzle"]));
  const dropped = [...new Set([...added, ...snapshots, ...unmerged])];
  for (const file of dropped) {
    git(cwd, ["rm", "-q", "-f", "--cached", "--ignore-unmatch", "--", file]);
    rmSync(path.join(cwd, file), { force: true });
  }
  const inBase = new Set(lines(git(cwd, ["ls-tree", "-r", "--name-only", base, "--", "drizzle"])));
  const restore = [...new Set([...dropped.filter((f) => inBase.has(f)), "drizzle/meta/_journal.json", ...[...inBase].filter((f) => f.endsWith("_snapshot.json"))])];
  git(cwd, ["checkout", base, "--", ...restore]);
  const stray = lines(git(cwd, ["diff", "--name-only", base, "--", ...restore]));
  if (stray.length > 0) throw new Error(`could not restore ${base}'s copy of: ${stray.join(", ")}`);
  return { asideDir, setAside, unionResolved, codeConflicts };
}

/** A ref git would not take for an option: non-empty, no leading dash, no whitespace or control characters. */
const refSchema = z.string().regex(/^[^-\s\x00-\x1f][^\s\x00-\x1f]*$/);
const argsSchema = z.tuple([refSchema], refSchema).refine((a) => a.length <= 2);

export type CliIo = { cwd: string; out: (line: string) => void; err: (line: string) => void };

/** The command line as a function of its arguments, returning the exit code. */
export function renumberMergeCli(argv: string[], io: CliIo): number {
  const args = argsSchema.safeParse(argv);
  if (!args.success) {
    io.err("usage: npx tsx scripts/migrations/renumber-merge.ts <branch-ref> [base-ref]  (a ref never starts with '-')");
    return 64;
  }
  const [branchRef, baseRef] = args.data;
  try {
    const result = renumberForMerge({ cwd: io.cwd, branchRef, baseRef });
    io.out(`Set aside ${result.setAside.length} migration file(s) in ${result.asideDir}`);
    for (const file of result.unionResolved) io.out(`Ticket file resolved by union: ${file}`);
    for (const file of result.codeConflicts) io.out(`CODE CONFLICT (not resolved): ${file}`);
    if (result.codeConflicts.length > 0) return 1;
    io.out(`Next: npm run db:generate, then npx tsx scripts/migrations/merge-proofs.ts ${result.asideDir}`);
    return 0;
  } catch (error) {
    io.err(`renumber-merge: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = renumberMergeCli(process.argv.slice(2), { cwd: process.cwd(), out: console.log, err: console.error });
}
