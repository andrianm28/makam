import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  pool: pg.Pool;
  close(): Promise<void>;
}

export function createDatabase(
  connectionString: string,
  options: { max?: number; applicationName?: string } = {},
): DatabaseHandle {
  const pool = new pg.Pool({
    connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? "makam",
  });
  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}

/** Wraps one checked-out connection (e.g. inside a transaction) as a Database. */
export function databaseOn(client: pg.PoolClient): Database {
  return drizzle(client, { schema }) as unknown as Database;
}
