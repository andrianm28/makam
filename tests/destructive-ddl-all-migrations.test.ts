import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { unmarkedInMigrationsAfter } from "../scripts/migrations/check-all-migrations";

function folder(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), "migrations-"));
  for (const [name, sql] of Object.entries(files)) writeFileSync(join(dir, name), sql);
  return dir;
}

describe("destructive DDL across every later migration", () => {
  it("names the file and the statement of an unmarked DROP COLUMN", () => {
    const dir = folder({ "0019_drop.sql": 'ALTER TABLE "tagihan" DROP COLUMN "catatan";' });
    const found = unmarkedInMigrationsAfter(dir, 18);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ file: "0019_drop.sql", statement: 'ALTER TABLE "tagihan" DROP COLUMN "catatan";' });
  });

  it("leaves migrations numbered 0018 and earlier alone", () => {
    const dir = folder({ "0018_old.sql": 'DROP TABLE "old";', "0019_ok.sql": 'ALTER TABLE "t" ADD COLUMN "c" text;' });
    expect(unmarkedInMigrationsAfter(dir, 18)).toEqual([]);
  });
});
