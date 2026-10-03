import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { renumberForMerge, renumberMergeCli } from "../../scripts/migrations/renumber-merge";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const d = mkdtempSync(path.join(tmpdir(), prefix));
  dirs.push(d);
  return d;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function write(cwd: string, file: string, content: string): void {
  mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
  writeFileSync(path.join(cwd, file), content);
}

function read(cwd: string, file: string): string {
  return readFileSync(path.join(cwd, file), "utf8");
}

/** Appends migration `tag` (e.g. "0001_feat") to the drizzle folder: SQL, snapshot chained to the previous one, journal entry. */
function addMigration(cwd: string, tag: string, sql: string): void {
  const journalPath = "drizzle/meta/_journal.json";
  const journal = existsSync(path.join(cwd, journalPath)) ? JSON.parse(read(cwd, journalPath)) : { entries: [] };
  const prev = journal.entries.at(-1);
  const prevId = prev ? `id-${prev.tag}` : "00000000-0000-0000-0000-000000000000";
  journal.entries.push({ idx: journal.entries.length, tag });
  write(cwd, journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  write(cwd, `drizzle/${tag}.sql`, sql);
  write(cwd, `drizzle/meta/${tag.slice(0, 4)}_snapshot.json`, `${JSON.stringify({ id: `id-${tag}`, prevId }, null, 2)}\n`);
}

function commit(cwd: string, message: string): void {
  git(cwd, "add", "-A");
  git(cwd, "commit", "-q", "-m", message);
}

/** A repo on `main` with migration 0000 committed. */
function fixtureRepo(): string {
  const cwd = tmp("makam-merge-mig-");
  git(cwd, "init", "-q", "-b", "main");
  git(cwd, "config", "user.email", "t@example.test");
  git(cwd, "config", "user.name", "t");
  addMigration(cwd, "0000_init", 'CREATE TABLE "base" ("id" int);');
  commit(cwd, "base");
  return cwd;
}

function journalTags(cwd: string): string[] {
  return JSON.parse(read(cwd, "drizzle/meta/_journal.json")).entries.map((e: { tag: string }) => e.tag);
}

describe("renumbering a branch's migration at merge time", () => {
  it("sets the branch's migration aside and leaves main's journal and snapshots, so the next generate takes the next free number", () => {
    const cwd = fixtureRepo();
    git(cwd, "checkout", "-q", "-b", "ticket-1");
    addMigration(cwd, "0001_feat", 'CREATE TABLE "feat" ("id" int);');
    commit(cwd, "ticket");
    git(cwd, "checkout", "-q", "main");

    const result = renumberForMerge({ cwd, branchRef: "ticket-1", baseRef: "HEAD" });

    expect(readdirSync(path.join(cwd, "drizzle")).filter((f) => f.endsWith(".sql"))).toEqual(["0000_init.sql"]);
    expect(existsSync(path.join(cwd, "drizzle/meta/0001_snapshot.json"))).toBe(false);
    expect(journalTags(cwd)).toEqual(["0000_init"]);
    expect(result.setAside.map((f) => path.basename(f))).toEqual(["0001_feat.sql"]);
    expect(readFileSync(result.setAside[0]!, "utf8")).toBe('CREATE TABLE "feat" ("id" int);');
  });
});

describe("renumbering when main has taken the branch's number", () => {
  it("keeps main's own migration, journal and snapshot and sets the branch's aside", () => {
    const cwd = fixtureRepo();
    git(cwd, "checkout", "-q", "-b", "ticket-2");
    addMigration(cwd, "0001_feat", 'CREATE TABLE "feat" ("id" int);');
    commit(cwd, "ticket");
    git(cwd, "checkout", "-q", "main");
    addMigration(cwd, "0001_other", 'CREATE TABLE "other" ("id" int);');
    commit(cwd, "main took 0001");

    const result = renumberForMerge({ cwd, branchRef: "ticket-2", baseRef: "HEAD" });

    expect(readdirSync(path.join(cwd, "drizzle")).filter((f) => f.endsWith(".sql")).sort()).toEqual(["0000_init.sql", "0001_other.sql"]);
    expect(journalTags(cwd)).toEqual(["0000_init", "0001_other"]);
    expect(JSON.parse(read(cwd, "drizzle/meta/0001_snapshot.json")).id).toBe("id-0001_other");
    expect(result.setAside.map((f) => path.basename(f))).toEqual(["0001_feat.sql"]);
    expect(git(cwd, "diff", "--name-only", "--diff-filter=U").trim()).toBe("");
  });
});

describe("conflicts outside drizzle during the merge", () => {
  function conflicting(file: string): string {
    const cwd = fixtureRepo();
    write(cwd, file, "start\n");
    commit(cwd, "file");
    git(cwd, "checkout", "-q", "-b", "ticket-3");
    write(cwd, file, "start\nbranch line\n");
    commit(cwd, "branch edit");
    git(cwd, "checkout", "-q", "main");
    write(cwd, file, "start\nmain line\n");
    commit(cwd, "main edit");
    return cwd;
  }

  it("keeps both sides of a ticket file's conflict and leaves it resolved", () => {
    const cwd = conflicting(".scratch/feature/issues/01-x.md");

    const result = renumberForMerge({ cwd, branchRef: "ticket-3", baseRef: "HEAD" });

    const text = read(cwd, ".scratch/feature/issues/01-x.md");
    expect(text).toContain("main line");
    expect(text).toContain("branch line");
    expect(text).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m);
    expect(result.unionResolved).toEqual([".scratch/feature/issues/01-x.md"]);
    expect(git(cwd, "diff", "--name-only", "--diff-filter=U").trim()).toBe("");
  });

  it("reports a code conflict and leaves it untouched for a person to resolve", () => {
    const cwd = conflicting("src/domain/x.ts");

    const result = renumberForMerge({ cwd, branchRef: "ticket-3", baseRef: "HEAD" });

    expect(result.codeConflicts).toEqual(["src/domain/x.ts"]);
    expect(read(cwd, "src/domain/x.ts")).toMatch(/^<<<<<<< /m);
    expect(git(cwd, "diff", "--name-only", "--diff-filter=U").trim()).toBe("src/domain/x.ts");
  });
});

describe("a merge that fails for a reason other than conflicts", () => {
  it("rethrows git's error and leaves main's drizzle files alone, instead of carrying on to delete and restore", () => {
    const cwd = fixtureRepo();
    git(cwd, "checkout", "-q", "-b", "ticket-4");
    addMigration(cwd, "0001_feat", 'CREATE TABLE "feat" ("id" int);');
    commit(cwd, "ticket");
    git(cwd, "checkout", "-q", "main");
    git(cwd, "config", "merge.verifySignatures", "true");

    expect(() => renumberForMerge({ cwd, branchRef: "ticket-4", baseRef: "HEAD" })).toThrow(/signature|merge/i);
    expect(journalTags(cwd)).toEqual(["0000_init"]);
    expect(existsSync(path.join(cwd, "drizzle/0000_init.sql"))).toBe(true);
  });
});

describe("a merge worktree with uncommitted changes", () => {
  it("is refused before anything is set aside, merged, deleted or restored", () => {
    const cwd = fixtureRepo();
    git(cwd, "checkout", "-q", "-b", "ticket-5");
    addMigration(cwd, "0001_feat", 'CREATE TABLE "feat" ("id" int);');
    commit(cwd, "ticket");
    git(cwd, "checkout", "-q", "main");
    write(cwd, "drizzle/0000_init.sql", 'CREATE TABLE "base" ("id" int);\n-- uncommitted edit\n');
    const asideDir = path.join(tmp("makam-aside-"), "aside");

    expect(() => renumberForMerge({ cwd, branchRef: "ticket-5", baseRef: "HEAD", asideDir })).toThrow(/uncommitted/i);
    expect(read(cwd, "drizzle/0000_init.sql")).toContain("uncommitted edit");
    expect(existsSync(asideDir)).toBe(false);
    expect(git(cwd, "rev-parse", "-q", "--verify", "HEAD").trim()).not.toBe("");
  });
});

describe("a restore that leaves main's journal changed", () => {
  /** A repo whose `git checkout <ref> -- <path>` leaves a stray line in the journal (a post-checkout hook). */
  function strayRestoreRepo(): string {
    const cwd = fixtureRepo();
    git(cwd, "checkout", "-q", "-b", "ticket-6");
    addMigration(cwd, "0001_feat", 'CREATE TABLE "feat" ("id" int);');
    commit(cwd, "ticket");
    git(cwd, "checkout", "-q", "main");
    const hook = path.join(cwd, ".git/hooks/post-checkout");
    writeFileSync(hook, "#!/bin/sh\necho stray >> drizzle/meta/_journal.json\n");
    chmodSync(hook, 0o755);
    return cwd;
  }

  it("throws instead of reporting a restored tree", () => {
    const cwd = strayRestoreRepo();

    expect(() => renumberForMerge({ cwd, branchRef: "ticket-6", baseRef: "HEAD" })).toThrow(/could not restore/);
  });

  it("makes the command line print the reason and exit non-zero", () => {
    const cwd = strayRestoreRepo();
    const err: string[] = [];

    const code = renumberMergeCli(["ticket-6"], { cwd, out: () => {}, err: (line) => err.push(line) });

    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/could not restore/);
  });
});

describe("the renumber command line's exit code", () => {
  function runCli(cwd: string, argv: string[]): { code: number; out: string; err: string } {
    const out: string[] = [];
    const err: string[] = [];
    const code = renumberMergeCli(argv, { cwd, out: (l) => out.push(l), err: (l) => err.push(l) });
    return { code, out: out.join("\n"), err: err.join("\n") };
  }

  function repoWithBranch(branchFile: string, mainFile?: string): string {
    const cwd = fixtureRepo();
    write(cwd, "src/x.ts", "start\n");
    commit(cwd, "file");
    git(cwd, "checkout", "-q", "-b", "ticket-7");
    addMigration(cwd, "0001_feat", 'CREATE TABLE "feat" ("id" int);');
    write(cwd, "src/x.ts", branchFile);
    commit(cwd, "ticket");
    git(cwd, "checkout", "-q", "main");
    if (mainFile !== undefined) {
      write(cwd, "src/x.ts", mainFile);
      commit(cwd, "main edit");
    }
    return cwd;
  }

  it("is 0 after a clean renumber, and names the set-aside folder and the next commands", () => {
    const cwd = repoWithBranch("start\nbranch\n");

    const { code, out } = runCli(cwd, ["ticket-7"]);

    expect(code).toBe(0);
    expect(out).toMatch(/Set aside 1 migration file/);
    expect(out).toMatch(/npm run db:generate/);
    expect(out).toMatch(/merge-proofs\.ts /);
  });

  it("is 1 on a code conflict, which it names and leaves unresolved", () => {
    const cwd = repoWithBranch("start\nbranch\n", "start\nmain\n");

    const { code, out } = runCli(cwd, ["ticket-7"]);

    expect(code).toBe(1);
    expect(out).toMatch(/CODE CONFLICT.*src\/x\.ts/);
    expect(read(cwd, "src/x.ts")).toMatch(/^<<<<<<< /m);
  });
});
