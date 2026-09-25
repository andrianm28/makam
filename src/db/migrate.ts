import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { PgBoss } from "pg-boss";
import { createDatabase } from "./client";

export const PG_BOSS_SCHEMA = "pgboss";

/**
 * Brings a database up to date: the Drizzle migrations in `drizzle/`, then the
 * pg-boss schema. This is the only code path that changes the schema; `web` and
 * `worker` never migrate on start (they only check that pg-boss is installed).
 */
export async function migrateDatabase(
  connectionString: string,
  options: { migrationsFolder?: string } = {},
): Promise<void> {
  const migrationsFolder =
    options.migrationsFolder ??
    process.env.MIGRATIONS_DIR ??
    path.resolve(process.cwd(), "drizzle");

  const handle = createDatabase(connectionString, { max: 1, applicationName: "makam-migrate" });
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }

  const boss = new PgBoss({
    connectionString,
    schema: PG_BOSS_SCHEMA,
    migrate: true,
    supervise: false,
    schedule: false,
    max: 1,
    application_name: "makam-migrate",
  });
  await boss.start();
  await boss.stop({ graceful: false, close: true });
}
