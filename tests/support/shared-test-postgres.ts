import pg from "pg";
import { docker, isNoSuchObject } from "../../scripts/lib/docker";

/**
 * One long-running local test Postgres for every worktree on the shared host
 * (`makam-testpg`), with a database per worktree, instead of a container per
 * test run. Opt in with MAKAM_TEST_PG=shared (`npm run test:shared`); without
 * it `npm test` keeps starting its own container, and CI keeps using
 * TEST_DATABASE_URL.
 */

export const SHARED_TEST_PG_CONTAINER = "makam-testpg";
const SHARED_TEST_PG_PORT = 55432;
const DEFAULT_SERVER_URL = `postgres://makam:makam@127.0.0.1:${SHARED_TEST_PG_PORT}/postgres`;

/** The shared server's maintenance database URL; MAKAM_TEST_PG_URL points it elsewhere. */
export function sharedTestPostgresUrl(): string {
  return process.env.MAKAM_TEST_PG_URL ?? DEFAULT_SERVER_URL;
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

async function onServer<T>(serverUrl: string, work: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: serverUrl, connectionTimeoutMillis: 3_000, application_name: "makam-testdb" });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

/** Drops the database (closing any connection still on it); harmless when it is not there. */
export async function dropDatabase(serverUrl: string, name: string): Promise<void> {
  await onServer(serverUrl, (client) => client.query(`drop database if exists ${quoteIdentifier(name)} with (force)`));
}

/** Drops and creates the database empty; returns its connection URL. */
export async function recreateDatabase(serverUrl: string, name: string): Promise<string> {
  await onServer(serverUrl, async (client) => {
    await client.query(`drop database if exists ${quoteIdentifier(name)} with (force)`);
    await client.query(`create database ${quoteIdentifier(name)}`);
  });
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

/**
 * Starts `makam-testpg` if it is not running (only when MAKAM_TEST_PG_URL is
 * unset: a server configured elsewhere is not ours to start) and waits until
 * it takes connections. Its data lives in tmpfs: nothing on disk, gone on
 * restart, which is fine because every run recreates its database.
 */
export async function ensureSharedTestPostgres(): Promise<string> {
  const serverUrl = sharedTestPostgresUrl();
  if (!process.env.MAKAM_TEST_PG_URL) {
    // A daemon that is down or refuses us fails the run here; only "no such object" means start it.
    const state = await docker(["inspect", "-f", "{{.State.Running}}", SHARED_TEST_PG_CONTAINER]).catch((error: unknown) => {
      if (isNoSuchObject(error)) return "missing";
      throw error;
    });
    if (state === "false") await docker(["start", SHARED_TEST_PG_CONTAINER]);
    if (state === "missing") {
      await docker([
        "run", "-d",
        "--name", SHARED_TEST_PG_CONTAINER,
        "--label", "makam.role=shared-test-postgres",
        "--restart", "unless-stopped",
        "-p", `127.0.0.1:${SHARED_TEST_PG_PORT}:5432`,
        "--tmpfs", "/var/lib/postgresql:rw,size=2g",
        "-e", "POSTGRES_USER=makam",
        "-e", "POSTGRES_PASSWORD=makam",
        "-e", "TZ=Asia/Jakarta",
        "postgres:18",
        "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off",
        "-c", "max_connections=200",
      ]).catch(async (error: unknown) => {
        // Another worktree started it at the same moment.
        if (!String(error).includes("Conflict")) throw error;
      });
    }
  }

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      await onServer(serverUrl, (client) => client.query("select 1"));
      return serverUrl;
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`Shared test Postgres at ${new URL(serverUrl).host} is not answering: ${String(error)}`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
