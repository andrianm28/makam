import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSnapshotChain, compareMigrationSql, runMergeProofs } from "../../scripts/migrations/merge-proofs";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** A drizzle folder whose snapshots are `[number, id, prevId]`. */
function drizzleDir(snapshots: [string, string, string][]): string {
  const root = mkdtempSync(path.join(tmpdir(), "makam-proofs-"));
  dirs.push(root);
  mkdirSync(path.join(root, "drizzle/meta"), { recursive: true });
  for (const [n, id, prevId] of snapshots) {
    writeFileSync(path.join(root, `drizzle/meta/${n}_snapshot.json`), JSON.stringify({ id, prevId }));
  }
  return path.join(root, "drizzle");
}

describe("the snapshot chain, resolved as a program", () => {
  it("passes an intact chain whose only dangling prevIds are the known gaps 0018, 0021 and 0024", () => {
    const dir = drizzleDir([
      ["0000", "a", "00000000-0000-0000-0000-000000000000"],
      ["0018", "b", "gone-1"],
      ["0021", "c", "gone-2"],
      ["0024", "d", "gone-3"],
      ["0025", "e", "d"],
    ]);

    const chain = checkSnapshotChain(dir);

    expect(chain.dangling).toEqual(["0018", "0021", "0024"]);
    expect(chain.unexpected).toEqual([]);
  });

  it("names a snapshot file that is not valid JSON with an id and a prevId, instead of guessing", () => {
    const dir = drizzleDir([["0000", "a", "00000000-0000-0000-0000-000000000000"]]);
    writeFileSync(path.join(dir, "meta/0001_snapshot.json"), JSON.stringify({ version: "7" }));

    expect(() => checkSnapshotChain(dir)).toThrow(/0001_snapshot\.json/);
  });

  it("flags a dangling prevId outside the known gaps", () => {
    const dir = drizzleDir([
      ["0018", "b", "gone-1"],
      ["0025", "e", "b"],
      ["0026", "f", "not-a-snapshot"],
    ]);

    const chain = checkSnapshotChain(dir);

    expect(chain.unexpected).toEqual(["0026"]);
  });
});

describe("the regenerated SQL against the branch's own migration", () => {
  const bp = "\n--> statement-breakpoint\n";
  const create = 'CREATE TABLE "feat" (\n\t"id" int\n);';
  const index = 'CREATE INDEX "feat_idx" ON "feat" ("id");';

  it("is statement-identical when only whitespace and the file's line endings differ", () => {
    const result = compareMigrationSql(`${create}${bp}${index}\n`, `${create}${bp}${index}`);

    expect(result).toEqual({ identical: true, ordered: true, handWritten: [], unexpected: [] });
  });

  it("reports a hand-written block the generator cannot produce, so it is re-appended", () => {
    const backfill = 'UPDATE "feat" SET "id" = 0 WHERE "id" IS NULL;';

    const result = compareMigrationSql(`${create}${bp}${index}`, `${create}${bp}${backfill}${bp}${index}`);

    expect(result.handWritten).toEqual([backfill]);
    expect(result.unexpected).toEqual([]);
    expect(result.identical).toBe(false);
  });

  it("is not in order when the generator emitted the branch's statements reordered", () => {
    const result = compareMigrationSql(`${index}${bp}${create}`, `${create}${bp}${index}`);

    expect(result.ordered).toBe(false);
    expect(result.identical).toBe(false);
  });

  it("treats a statement the generator emitted twice as unexpected when the branch has it once", () => {
    const result = compareMigrationSql(`${index}${bp}${index}`, index);

    expect(result.unexpected).toEqual([index]);
  });

  it("fails when the generator emitted a statement the branch does not have", () => {
    const stray = 'CREATE TABLE "base_again" ("id" int);';

    const result = compareMigrationSql(`${create}${bp}${stray}`, create);

    expect(result.unexpected).toEqual([stray]);
  });
});

describe("the three proofs as one run", () => {
  function setup(opts: { generated: string; branch: string }) {
    const dir = drizzleDir([
      ["0000", "a", "00000000-0000-0000-0000-000000000000"],
      ["0001", "b", "a"],
    ]);
    const aside = mkdtempSync(path.join(tmpdir(), "makam-aside-"));
    dirs.push(aside);
    writeFileSync(path.join(dir, "0001_feat.sql"), opts.generated);
    writeFileSync(path.join(aside, "0001_feat.sql"), opts.branch);
    return { drizzleDir: dir, asideDir: aside, newFiles: [path.join(dir, "0001_feat.sql")] };
  }
  const sql = 'CREATE TABLE "feat" ("id" int);';

  it("passes when the SQL is identical, a second generate has nothing to migrate and the chain is intact", () => {
    const report = runMergeProofs({ ...setup({ generated: sql, branch: sql }), generate: () => "No schema changes, nothing to migrate" });

    expect(report.ok).toBe(true);
    expect(report.secondGenerateClean).toBe(true);
  });

  it("fails when a second generate still finds a schema change, which is how a broken snapshot chain shows", () => {
    const report = runMergeProofs({ ...setup({ generated: sql, branch: sql }), generate: () => "[✓] Your SQL migration file ➜ drizzle/0002_x.sql 🚀" });

    expect(report.secondGenerateClean).toBe(false);
    expect(report.ok).toBe(false);
  });

  it("fails when the new migration holds destructive DDL without a contract marker", () => {
    const drop = 'DROP TABLE "base";';

    const report = runMergeProofs({ ...setup({ generated: drop, branch: drop }), generate: () => "nothing to migrate" });

    expect(report.destructive).toHaveLength(1);
    expect(report.destructive[0]!.reason).toMatch(/drop/i);
    expect(report.ok).toBe(false);
  });

  it("accepts destructive DDL marked with a contract reason", () => {
    const drop = '-- contract: nothing running reads it\nDROP TABLE "base";';

    const report = runMergeProofs({ ...setup({ generated: drop, branch: drop }), generate: () => "nothing to migrate" });

    expect(report.destructive).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("is not OK when the regenerated statements are reordered against the branch's", () => {
    const a = 'CREATE TABLE "a" ("id" int);';
    const b = 'CREATE TABLE "b" ("id" int);';
    const bp = "\n--> statement-breakpoint\n";

    const report = runMergeProofs({ ...setup({ generated: `${b}${bp}${a}`, branch: `${a}${bp}${b}` }), generate: () => "nothing to migrate" });

    expect(report.ok).toBe(false);
  });

  it("is not OK while the branch has a hand-written block the regenerated file lacks: re-append it, then rerun", () => {
    const backfill = 'UPDATE "feat" SET "id" = 0 WHERE "id" IS NULL;';
    const bp = "\n--> statement-breakpoint\n";

    const report = runMergeProofs({ ...setup({ generated: sql, branch: `${sql}${bp}${backfill}` }), generate: () => "nothing to migrate" });

    expect(report.reappend).toEqual([backfill]);
    expect(report.ok).toBe(false);
  });

  it("is not OK when a snapshot main has is gone from the merged tree", () => {
    const fixture = setup({ generated: sql, branch: sql });
    const onBase = { "0000_snapshot.json": readFileSync(path.join(fixture.drizzleDir, "meta/0000_snapshot.json"), "utf8"), "0007_snapshot.json": "{}" };

    const report = runMergeProofs({ ...fixture, baseSnapshots: onBase, generate: () => "nothing to migrate" });

    expect(report.baseSnapshotProblems).toEqual(["0007_snapshot.json: missing"]);
    expect(report.ok).toBe(false);
  });

  it("is not OK when a snapshot main has differs byte for byte in the merged tree", () => {
    const fixture = setup({ generated: sql, branch: sql });

    const report = runMergeProofs({ ...fixture, baseSnapshots: { "0000_snapshot.json": '{"id":"other"}' }, generate: () => "nothing to migrate" });

    expect(report.baseSnapshotProblems).toEqual(["0000_snapshot.json: differs from main's"]);
    expect(report.ok).toBe(false);
  });

  it("pairs each regenerated file with the branch's by migration number, whatever random names drizzle gave them", () => {
    const dir = drizzleDir([
      ["0000", "a", "00000000-0000-0000-0000-000000000000"],
      ["0001", "b", "a"],
      ["0002", "c", "b"],
    ]);
    const aside = mkdtempSync(path.join(tmpdir(), "makam-aside-"));
    dirs.push(aside);
    const first = 'CREATE TABLE "first" ("id" int);';
    const second = 'CREATE TABLE "second" ("id" int);';
    // lexically the later migration's name sorts first: "0002_apple" is after "0001_zebra" only because of the number
    writeFileSync(path.join(dir, "0001_zebra.sql"), first);
    writeFileSync(path.join(dir, "0002_apple.sql"), second);
    writeFileSync(path.join(aside, "0001_one.sql"), first);
    writeFileSync(path.join(aside, "0002_two.sql"), second);

    const report = runMergeProofs({
      drizzleDir: dir,
      asideDir: aside,
      newFiles: [path.join(dir, "0002_apple.sql"), path.join(dir, "0001_zebra.sql")],
      generate: () => "nothing to migrate",
    });

    expect(report.ok).toBe(true);
  });
});
