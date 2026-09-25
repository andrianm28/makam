import { sql } from "drizzle-orm";
import { inject } from "vitest";
import { createDatabase, type DatabaseHandle } from "@/db/client";

let handle: DatabaseHandle | undefined;

/**
 * The run's migrated test Postgres (see tests/global-setup.ts). One pool per
 * test file; call `close` in afterAll.
 */
export function testDatabase(): DatabaseHandle {
  handle ??= createDatabase(inject("databaseUrl"), { max: 4, applicationName: "makam-test" });
  const current = handle;
  return {
    db: current.db,
    pool: current.pool,
    close: async () => {
      await current.close();
      handle = undefined;
    },
  };
}

/** Empties every app table (not the migration journal, not pg-boss). */
export async function resetDatabase(): Promise<void> {
  if (!handle) throw new Error("call testDatabase() before resetDatabase()");
  const { rows } = await handle.pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public'",
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `"public"."${row.tablename}"`).join(", ");
  await handle.db.execute(sql.raw(`truncate ${tables} restart identity cascade`));
}
