import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import pg from "pg";
import type { TestProject } from "vitest/node";
import { migrateDatabase } from "../src/db/migrate";
import { forgetDirtyTables } from "./support/dirty-tables";
import { dropDatabase, ensureSharedTestPostgres, recreateDatabase } from "./support/shared-test-postgres";
import { testDatabaseName } from "../scripts/lib/worktree";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Gives the test run one real Postgres, migrated fresh:
 *
 * - TEST_DATABASE_URL set: that existing, empty database (CI uses a Postgres
 *   service container this way);
 * - MAKAM_TEST_PG=shared (`npm run test:shared`): this worktree's own database
 *   on the shared `makam-testpg` server, recreated now and dropped after;
 * - otherwise (the default): a Postgres container started for this run.
 */
export default async function setup(project: TestProject) {
  let container: StartedPostgreSqlContainer | undefined;
  let shared: { serverUrl: string; name: string } | undefined;
  let databaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl && process.env.MAKAM_TEST_PG === "shared") {
    const serverUrl = await ensureSharedTestPostgres();
    const name = testDatabaseName(project.config.root);
    databaseUrl = await recreateDatabase(serverUrl, name);
    shared = { serverUrl, name };
  }

  if (!databaseUrl) {
    container = await new PostgreSqlContainer(
      // The same Postgres as staging and CI, by digest.
      "postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722",
    )
      .withDatabase("makam_test")
      .withUsername("makam")
      .withPassword("makam")
      // Test-tuned: nothing here has to survive a crash (never staging or production; CI's service is tuned in ci.yml).
      .withCommand(["postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off"])
      .start();
    databaseUrl = container.getConnectionUri();
  }

  await migrateDatabase(databaseUrl);
  // A database an earlier run used may still carry that run's record of written tables.
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    await forgetDirtyTables((text) => client.query(text));
  } finally {
    await client.end();
  }
  project.provide("databaseUrl", databaseUrl);

  return async () => {
    if (shared) await dropDatabase(shared.serverUrl, shared.name);
    await container?.stop();
  };
}
