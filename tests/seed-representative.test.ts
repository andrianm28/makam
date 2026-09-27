import { execFile } from "node:child_process";
import pg from "pg";
import { describe, expect, inject, it } from "vitest";
import { dropDatabase, recreateDatabase } from "./support/shared-test-postgres";

// The upgrade seed (scripts/migrations/seed-representative.ts) fills a
// database the running release migrated, so the new migrations run against
// non-empty tables. A table left empty hides exactly the breakage the upgrade
// test exists to catch, so the script must fail when ANY table stays empty.
const runUrl = new URL(inject("databaseUrl"));
const name = `${runUrl.pathname.slice(1, 56)}_seedprobe`;
const serverUrl = (() => {
  const url = new URL(runUrl);
  url.pathname = "/postgres";
  return url.toString();
})();

async function run(databaseUrl: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

function seed(databaseUrl: string): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["tsx", "scripts/migrations/seed-representative.ts"],
      { env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 60_000 },
      (error, stdout, stderr) => {
        resolve({ code: (error as { code?: number } | null)?.code ?? 0, output: `${stdout}\n${stderr}` });
      },
    );
  });
}

describe("the upgrade seed", () => {
  it("fails when any table stays empty, even while others fill", async () => {
    const databaseUrl = await recreateDatabase(serverUrl, name);
    try {
      await run(databaseUrl, "create table fillable (id uuid primary key, note text)");
      await run(databaseUrl, "create table unfillable (id uuid primary key, note text not null check (false))");
      const { code, output } = await seed(databaseUrl);
      expect(output).toMatch(/unfillable/);
      expect(code).toBe(1);
    } finally {
      await dropDatabase(serverUrl, name);
    }
  }, 90_000);
});
