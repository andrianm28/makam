import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { mergeProofsCli } from "../../scripts/migrations/merge-proofs";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

const ZERO = "00000000-0000-0000-0000-000000000000";
const BREAKPOINT = "\n--> statement-breakpoint\n";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function write(file: string, content: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, content);
}

/**
 * A merge worktree after `db:generate`: main's 0000 is committed; 0001 (the regenerated
 * migration, its snapshot and the journal entry) is uncommitted; the branch's own SQL is in `asideDir`.
 */
function mergeWorktree(branchSql: string, generatedSql: string): { cwd: string; asideDir: string } {
  const cwd = mkdtempSync(path.join(tmpdir(), "makam-proofs-cli-"));
  const asideDir = mkdtempSync(path.join(tmpdir(), "makam-aside-"));
  dirs.push(cwd, asideDir);
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.test");
  git(cwd, "config", "user.name", "t");
  write(path.join(cwd, "drizzle/0000_init.sql"), 'CREATE TABLE "base" ("id" int);');
  write(path.join(cwd, "drizzle/meta/0000_snapshot.json"), JSON.stringify({ id: "a", prevId: ZERO }));
  write(path.join(cwd, "drizzle/meta/_journal.json"), JSON.stringify({ entries: [{ idx: 0, tag: "0000_init" }] }));
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", "base");
  write(path.join(cwd, "drizzle/0001_gen.sql"), generatedSql);
  write(path.join(cwd, "drizzle/meta/0001_snapshot.json"), JSON.stringify({ id: "b", prevId: "a" }));
  write(path.join(cwd, "drizzle/meta/_journal.json"), JSON.stringify({ entries: [{ idx: 0, tag: "0000_init" }, { idx: 1, tag: "0001_gen" }] }));
  write(path.join(asideDir, "0001_feat.sql"), branchSql);
  return { cwd, asideDir };
}

function run(cwd: string, argv: string[], generate = () => "No schema changes, nothing to migrate") {
  const out: string[] = [];
  const err: string[] = [];
  const code = mergeProofsCli(argv, { cwd, out: (l) => out.push(l), err: (l) => err.push(l), generate });
  return { code, out: out.join("\n"), err: err.join("\n") };
}

const sql = 'CREATE TABLE "feat" ("id" int);';

describe("the merge-proofs command line's exit code", () => {
  it("is 0 and says PROOFS OK when every proof holds, 1 and PROOFS FAILED when one does not", () => {
    const { cwd, asideDir } = mergeWorktree(sql, sql);

    expect(run(cwd, [asideDir])).toMatchObject({ code: 0, out: expect.stringContaining("PROOFS OK") });
    const failed = run(cwd, [asideDir], () => "[✓] Your SQL migration file ➜ drizzle/0002_x.sql");
    expect(failed.code).toBe(1);
    expect(failed.out).toContain("PROOFS FAILED");
  });
});
