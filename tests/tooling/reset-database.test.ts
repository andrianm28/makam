import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signedInAdminPlatform } from "../support/identity";
import { lokasiOnTestDatabase, newLokasiMitra } from "../support/lokasi";
import { resetDatabase, testDatabase } from "../support/database";

// resetDatabase empties only what was touched since the last reset, so what a
// test must never see is anything an earlier test wrote, in any module's table.
const handle = testDatabase();

/** Row counts of every app table that holds a row, read straight from Postgres. */
async function filledTables(): Promise<Record<string, number>> {
  const { rows } = await handle.pool.query<{ name: string; n: number }>(
    `select relname as name,
            (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', relname), false, true, '')))[1]::text::int as n
       from pg_class c join pg_namespace s on s.oid = c.relnamespace
      where s.nspname = 'public' and c.relkind in ('r', 'p')`,
  );
  return Object.fromEntries(rows.filter((row) => row.n > 0).map((row) => [row.name, row.n]));
}

beforeAll(async () => {
  await resetDatabase();
});
afterAll(async () => {
  await handle.close();
});

describe("Resetting the test database between tests", () => {
  it("setup: writes rows through Identity, Audit Log and Lokasi", async () => {
    const setup = lokasiOnTestDatabase(handle.db);
    const { actor } = await signedInAdminPlatform(setup);
    await newLokasiMitra(setup, actor);
    expect(Object.keys(await filledTables()).length).toBeGreaterThan(2);
  });

  it("a later test does not see the rows an earlier test wrote, in any module", async () => {
    await resetDatabase();
    expect(await filledTables()).toEqual({});
  });

  it("empties a table written to again after a reset", async () => {
    const setup = lokasiOnTestDatabase(handle.db);
    const { actor } = await signedInAdminPlatform(setup);
    await newLokasiMitra(setup, actor, "Makam Wakaf Baru");
    expect(Object.keys(await filledTables()).length).toBeGreaterThan(2);
    await resetDatabase();
    expect(await filledTables()).toEqual({});
  });

  it("empties rows written on another connection, and a table created after the first reset", async () => {
    await handle.pool.query("create table public.zz_reset_probe (id serial primary key, note text)");
    try {
      await resetDatabase();
      const other = await handle.pool.connect();
      try {
        await other.query("insert into public.zz_reset_probe (note) values ('stray')");
      } finally {
        other.release();
      }
      expect(await filledTables()).toEqual({ zz_reset_probe: 1 });
      await resetDatabase();
      expect(await filledTables()).toEqual({});
      const next = await handle.pool.query<{ id: number }>("insert into public.zz_reset_probe (note) values ('again') returning id");
      expect(next.rows[0].id).toBe(1);
    } finally {
      await handle.pool.query("drop table public.zz_reset_probe");
      await resetDatabase();
    }
  });

  it("restarts an identity that only a rolled-back insert advanced", async () => {
    await handle.pool.query("create table public.zz_seq_probe (id serial primary key, note text)");
    try {
      await resetDatabase();
      await handle.pool.query("begin; insert into public.zz_seq_probe (note) values ('gone'); rollback");
      await resetDatabase();
      const next = await handle.pool.query<{ id: number }>("insert into public.zz_seq_probe (note) values ('first') returning id");
      expect(next.rows[0].id).toBe(1);
    } finally {
      await handle.pool.query("drop table public.zz_seq_probe");
      await resetDatabase();
    }
  });
});
