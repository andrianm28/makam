import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { checkSnapshotChain } from "../../scripts/migrations/merge-proofs";

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
