import pg from "pg";
import { afterAll, describe, expect, inject, it } from "vitest";
import { dropDatabase, recreateDatabase } from "../support/shared-test-postgres";

// The run's own Postgres stands in for the shared test Postgres: any server
// where the test user may create databases.
// The probe is named after the run's database, so worktrees testing on the
// shared server at the same time never share it.
const runUrl = new URL(inject("databaseUrl"));
const name = `${runUrl.pathname.slice(1, 56)}_probe`;
const serverUrl = (() => {
  const url = new URL(runUrl);
  url.pathname = "/postgres";
  return url.toString();
})();

async function tablesIn(databaseUrl: string): Promise<string[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    return rows.map((row) => row.tablename);
  } finally {
    await client.end();
  }
}

async function run(databaseUrl: string, statement: string): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await client.query(statement);
  } finally {
    await client.end();
  }
}

describe("a worktree's database on the shared test Postgres", () => {
  afterAll(async () => {
    await dropDatabase(serverUrl, name);
  });

  it("is created empty, and recreated empty on the next run", async () => {
    const databaseUrl = await recreateDatabase(serverUrl, name);
    expect(new URL(databaseUrl).pathname).toBe(`/${name}`);
    await run(databaseUrl, "create table left_over (id int)");
    expect(await tablesIn(databaseUrl)).toEqual(["left_over"]);

    const again = await recreateDatabase(serverUrl, name);
    expect(await tablesIn(again)).toEqual([]);
  });

  it("is dropped even while a connection is still open, and dropping it twice is harmless", async () => {
    const databaseUrl = await recreateDatabase(serverUrl, name);
    const straggler = new pg.Client({ connectionString: databaseUrl });
    await straggler.connect();
    straggler.on("error", () => {});

    await dropDatabase(serverUrl, name);
    await dropDatabase(serverUrl, name);

    await expect(tablesIn(databaseUrl)).rejects.toMatchObject({ code: "3D000" });
    await straggler.end().catch(() => {});
  });
});
