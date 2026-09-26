import path from "node:path";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { migrateDatabase } from "../src/db/migrate";
import { dropDatabase, ensureSharedTestPostgres, recreateDatabase } from "./support/shared-test-postgres";
import { testDatabaseName } from "./support/worktree";

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
    const name = testDatabaseName(path.basename(project.config.root));
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
      .start();
    databaseUrl = container.getConnectionUri();
  }

  await migrateDatabase(databaseUrl);
  project.provide("databaseUrl", databaseUrl);

  return async () => {
    if (shared) await dropDatabase(shared.serverUrl, shared.name);
    await container?.stop();
  };
}
