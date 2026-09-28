import { execFile } from "node:child_process";
import pg from "pg";
import { describe, expect, inject, it } from "vitest";
import { migrateDatabase } from "../src/db/migrate";
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

async function read<T extends pg.QueryResultRow>(databaseUrl: string, query: string): Promise<T[]> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return (await client.query<T>(query)).rows;
  } finally {
    await client.end();
  }
}

/** Every table in `public` with its row count, counted (the catalog's estimates are stale). */
async function rowCounts(databaseUrl: string): Promise<Record<string, number>> {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const tables = await client.query<{ table_name: string }>(
      `select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> '__drizzle_migrations'
        order by table_name`,
    );
    const counts: Record<string, number> = {};
    for (const { table_name } of tables.rows) {
      const counted = await client.query<{ count: number }>(`select count(*)::int as count from "${table_name}"`);
      counts[table_name] = counted.rows[0].count;
    }
    return counts;
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

  /**
   * CI's own step, on the real schema: every table this commit's migrations
   * create gets filled, so the upgrade runs against rows everywhere. A CHECK
   * that ties two columns together, or that lists the values a `text` column
   * may hold, is invisible to a seeder that guesses by type, so the tables
   * carrying one are the ones this guards (they were left empty, and the
   * tables depending on them with them).
   */
  it("fills a database migrated with this commit's migrations, every table", async () => {
    const databaseUrl = await recreateDatabase(serverUrl, name);
    try {
      await migrateDatabase(databaseUrl);
      const { code, output } = await seed(databaseUrl);
      expect(output).not.toMatch(/left empty/);
      expect(code).toBe(0);
      // No table may be left with no rows, whichever way the seed got there.
      const counts = await rowCounts(databaseUrl);
      expect(Object.keys(counts).length).toBeGreaterThan(50);
      expect(Object.entries(counts).filter(([, count]) => count === 0)).toEqual([]);
    } finally {
      await dropDatabase(serverUrl, name);
    }
  }, 180_000);

  /**
   * The values a CHECK forced the seed to state, read back: a Petak is a `petak`
   * with a Jenis Makam that exists, and a Hak Pakai is on a Petak or a Kavling
   * but never on both (a guessed value fills a column the constraint pairs and
   * then the whole table is empty).
   */
  it("states the values the cross-column CHECKs ask for", async () => {
    const databaseUrl = await recreateDatabase(serverUrl, name);
    try {
      await migrateDatabase(databaseUrl);
      expect((await seed(databaseUrl)).code).toBe(0);
      const petak = await read<{ kind: string; ada_nomor: boolean; jenis_ada: boolean; kavling_ada: boolean }>(
        databaseUrl,
        `select p.kind, p.nomor_makam is not null as ada_nomor,
                t.id is not null as jenis_ada, k.id is not null as kavling_ada
           from inventory_petak p
           left join tariff_jenis_makam t on t.id = p.jenis_makam_id
           left join inventory_kavling k on k.id = p.kavling_id`,
      );
      expect(petak.length).toBeGreaterThan(0);
      expect(petak.every((row) => row.kind === "petak" && row.ada_nomor && row.jenis_ada)).toBe(true);
      const targets = await read<{ petak: boolean; kavling: boolean }>(
        databaseUrl,
        `select petak_id is not null as petak, kavling_id is not null as kavling from inventory_hak_pakai
         union all select petak_id is not null, kavling_id is not null from inventory_plot_hold`,
      );
      expect(targets.length).toBeGreaterThan(0);
      expect(targets.every((row) => row.petak !== row.kavling)).toBe(true);
      const events = await read<{ kind: string; outcome: string }>(databaseUrl, "select kind, outcome from payment_webhook_event");
      expect(events.length).toBeGreaterThan(0);
      expect(events.every((row) => row.kind === "paid" && row.outcome === "lunas")).toBe(true);
    } finally {
      await dropDatabase(serverUrl, name);
    }
  }, 180_000);
});
