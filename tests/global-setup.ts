import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";
import { migrateDatabase } from "../src/db/migrate";

declare module "vitest" {
  export interface ProvidedContext {
    databaseUrl: string;
  }
}

/**
 * Starts one real Postgres for the test run and migrates it fresh.
 *
 * Set TEST_DATABASE_URL to use an existing, empty database instead (CI uses a
 * Postgres service container this way).
 */
export default async function setup(project: TestProject) {
  let container: StartedPostgreSqlContainer | undefined;
  let databaseUrl = process.env.TEST_DATABASE_URL;

  if (!databaseUrl) {
    container = await new PostgreSqlContainer("postgres:18")
      .withDatabase("makam_test")
      .withUsername("makam")
      .withPassword("makam")
      .start();
    databaseUrl = container.getConnectionUri();
  }

  await migrateDatabase(databaseUrl);
  project.provide("databaseUrl", databaseUrl);

  return async () => {
    await container?.stop();
  };
}
