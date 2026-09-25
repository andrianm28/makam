import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./client";
import { createPgBoss } from "./pg-boss";

/**
 * Brings a database up to date: the Drizzle migrations in `drizzle/`, then the
 * pg-boss schema. This is the only code path that changes the schema; `web` and
 * `worker` never migrate on start (they only check that pg-boss is installed).
 */
export async function migrateDatabase(
  connectionString: string,
  /** `migrationsFolder` defaults to ./drizzle; `npm run migrate` passes MIGRATIONS_DIR. */
  options: { migrationsFolder?: string } = {},
): Promise<void> {
  const migrationsFolder = options.migrationsFolder ?? path.resolve(process.cwd(), "drizzle");

  const handle = createDatabase(connectionString, { max: 1, applicationName: "makam-migrate" });
  try {
    await migrate(handle.db, { migrationsFolder });
  } finally {
    await handle.close();
  }

  const boss = createPgBoss({ connectionString, migrate: true, max: 1, applicationName: "makam-migrate" });
  await boss.start();
  await boss.stop({ graceful: false, close: true });
}
