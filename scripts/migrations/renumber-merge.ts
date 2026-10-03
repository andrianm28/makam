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
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

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
};

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function lines(out: string): string[] {
  return out.split("\n").filter(Boolean);
}

export function renumberForMerge(options: RenumberOptions): RenumberResult {
  const { cwd, branchRef } = options;
  const baseRef = options.baseRef ?? "HEAD";
  const base = git(cwd, ["rev-parse", baseRef]).trim();
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

  try {
    git(cwd, ["merge", "--no-commit", "--no-ff", branchRef]);
  } catch {
    // conflicts are expected; they are handled below
  }

  for (const file of [...added, ...snapshots]) git(cwd, ["rm", "-q", "-f", "--", file]);
  git(cwd, ["checkout", base, "--", "drizzle/meta/_journal.json"]);
  return { asideDir, setAside };
}

if (require.main === module) {
  const [branchRef, baseRef] = process.argv.slice(2);
  if (!branchRef) {
    console.error("usage: npx tsx scripts/migrations/renumber-merge.ts <branch-ref> [base-ref]");
    process.exit(2);
  }
  const result = renumberForMerge({ cwd: process.cwd(), branchRef, baseRef });
  console.log(`Set aside ${result.setAside.length} migration file(s) in ${result.asideDir}`);
  console.log("Next: npm run db:generate, then npx tsx scripts/migrations/merge-proofs.ts " + result.asideDir);
}
