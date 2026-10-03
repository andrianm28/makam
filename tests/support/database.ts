import { inject } from "vitest";
import { createDatabase, type DatabaseHandle } from "@/db/client";
import { truncateDirtyTables } from "./dirty-tables";

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

/**
 * Empties every app table written to since the last reset (not the migration
 * journal, not pg-boss), and every table the first time: see dirty-tables.ts.
 */
export async function resetDatabase(): Promise<void> {
  if (!handle) throw new Error("call testDatabase() before resetDatabase()");
  const { pool } = handle;
  await truncateDirtyTables((text) => pool.query<{ tablename: string }>(text));
}
