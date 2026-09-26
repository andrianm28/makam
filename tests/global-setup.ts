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
    await container?.stop();
  };
}
