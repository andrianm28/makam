// The nightly database Dump of the beta (ticket 64, ADR 0002 beta UAT
// amendment): deploy/bin/makam-backup-db and deploy/bin/makam-restore-test,
// driven through their own command line, the way the host's systemd timers and
// CI run them.
//
// The Dump is taken from a Postgres container this file starts (the same image
// by digest as staging and CI, its own name and label, published on 127.0.0.1
// only so this test can migrate it and put rows in it). Nothing here needs the
// host's makam-staging or makam-prod project, and the throwaway restore
// container the script starts is never published at all.
import { execFile } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrateDatabase } from "../../src/db/migrate";
import { docker, lines } from "../../scripts/lib/docker";

const root = path.resolve(fileURLToPath(new URL("../..", import.meta.url)));
const backupScript = path.join(root, "deploy/bin/makam-backup-db");
const restoreScript = path.join(root, "deploy/bin/makam-restore-test");

/** The same image staging, production and the test run use, by digest. */
const PG_IMAGE = "postgres:18.6@sha256:5a5a84b19854a9ffaa54082c166ff4ec27473a361e496e5ea167f298f2da9722";
const PASSPHRASE = "test-passphrase-for-the-beta-dump";
/** The encryption the scripts use, so the test reads a Dump exactly as the operator would. */
const CIPHER_ARGS = ["-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-md", "sha256"];
/** The environment name the scripts are given; like the host's timers, so the scripts' own guard is exercised. */
const ENV_NAME = "staging";
/** Where the scripts read the passphrase from, the way the host keeps it. */
const PASSPHRASE_FILE = "backup-passphrase";

const sourceName = `makam-dbsrc-t64-${process.pid}`;
const tempRoots: string[] = [];

let sourceUrl = "";
/** Whatever restore containers already existed when this file started. */
let restoreContainersAtStart: string[] = [];

/** A free port on 127.0.0.1, so two test runs never collide. */
async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address === "string" || address === null) return reject(new Error("no port"));
      const { port } = address;
      server.close(() => resolve(port));
    });
  });
}

/**
 * Waits until the image's real server answers over TCP. `pg_isready` inside the
 * container is not enough: the official image runs a temporary server during
 * initdb that listens on the socket only, and the connections this test opens
 * to it die when the real one takes over.
 */
async function waitForPostgres(url: string): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      await client.query("select 1");
      return;
    } catch {
      if (attempt >= 120) throw new Error(`${url} never became ready`);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}

/** A fresh MAKAM_ROOT with the passphrase file the scripts read, in a directory only this test uses. */
async function freshRoot(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "makam-db-backup-"));
  tempRoots.push(dir);
  await mkdir(path.join(dir, ENV_NAME), { recursive: true });
  await writeFile(path.join(dir, PASSPHRASE_FILE), `${PASSPHRASE}\n`, { mode: 0o600 });
  return dir;
}

type Run = { code: number; stdout: string; stderr: string };

function runScript(script: string, args: string[], env: Record<string, string>): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      script,
      args,
      { env: { ...process.env, MAKAM_ROOT: "", MAKAM_BACKUP_PASSPHRASE_FILE: "", ...env }, timeout: 300_000 },
      (error, stdout, stderr) => {
        resolve({ code: error ? ((error as { code?: number }).code ?? 1) : 0, stdout, stderr });
      },
    );
  });
}

/**
 * Always names the container this file started, never the compose default: this
 * host runs makam-staging, and a test must never read from it.
 */
const backup = (dir: string, args: string[] = [], env: Record<string, string> = {}) =>
  runScript(backupScript, ["--env", ENV_NAME, "--container", sourceName, ...args], { MAKAM_ROOT: dir, MAKAM_BACKUP_PASSPHRASE_FILE: path.join(dir, PASSPHRASE_FILE), ...env });

const restoreCheck = (dir: string, args: string[] = [], env: Record<string, string> = {}) =>
  runScript(restoreScript, ["--env", ENV_NAME, ...args], { MAKAM_ROOT: dir, MAKAM_BACKUP_PASSPHRASE_FILE: path.join(dir, PASSPHRASE_FILE), ...env });

async function filesIn(dir: string, suffix: string): Promise<string[]> {
  const entries = await readdir(path.join(dir, ENV_NAME, "backups/db")).catch(() => [] as string[]);
  return entries.filter((name) => name.endsWith(suffix)).sort();
}

/** Where a night's Dump and its counts live under this test's MAKAM_ROOT. */
const dumpFile = (dir: string, name: string) => path.join(dir, ENV_NAME, "backups/db", name);

/** Decrypts a Dump exactly as the restore check does, so the test reads what the operator would. */
function decrypt(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "openssl",
      ["enc", "-d", ...CIPHER_ARGS, "-in", file, "-pass", "env:MAKAM_TEST_PASSPHRASE"],
      { env: { ...process.env, MAKAM_TEST_PASSPHRASE: PASSPHRASE }, maxBuffer: 32 * 1024 * 1024 },
      (error, stdout) => (error ? reject(error) : resolve(stdout)),
    );
  });
}

beforeAll(async () => {
  restoreContainersAtStart = await restoreContainers();
  const port = await freePort();
  await docker([
    "run", "-d", "--name", sourceName,
    "--label", "makam.role=t64-dump-source",
    "-e", "POSTGRES_USER=makam", "-e", "POSTGRES_DB=makam", "-e", "POSTGRES_PASSWORD=makam",
    "-p", `127.0.0.1:${port}:5432`,
    PG_IMAGE,
  ]);
  sourceUrl = `postgres://makam:makam@127.0.0.1:${port}/makam`;
  await waitForPostgres(sourceUrl);
  await migrateDatabase(sourceUrl);
  const client = new Client({ connectionString: sourceUrl });
  await client.connect();
  try {
    for (let n = 1; n <= 3; n += 1) {
      await client.query(
        "insert into identity_user (id, name, placeholder_email, created_at, updated_at) values ($1, $2, $3, now(), now())",
        [`akun-t64-${n}`, `Akun ${n}`, `akun-t64-${n}@akun.makam.invalid`],
      );
    }
    await client.query(
      "insert into operator_settings_version (in_force_from, legal_name, address, phone, email, cs_whatsapp, cs_reply_hours, changed_by_account_id) values (now(), 'Yayasan', 'Jl.', '+62812', 'ops@makam.co.id', '+62812', 'Senin-Jumat', 'akun-t64-1')",
    );
  } finally {
    await client.end();
  }
}, 180_000);

afterAll(async () => {
  for (const dir of tempRoots) await rm(dir, { recursive: true, force: true });
  // Only what this run started: a crashed test must not leave a stopped
  // container on a host four agents share.
  for (const name of await newRestoreContainers()) await docker(["rm", "-f", name]);
  await docker(["rm", "-f", sourceName]);
});

describe("the nightly Dump of the database", () => {
  it("writes an encrypted dump and the row counts a later restore is checked against", async () => {
    const dir = await freshRoot();
    const result = await backup(dir);

    expect(result.stderr).not.toContain("refusing");
    expect(result.code).toBe(0);

    const dumps = await filesIn(dir, ".dump.enc");
    const counts = await filesIn(dir, ".counts.enc");
    expect(dumps).toHaveLength(1);
    expect(counts).toHaveLength(1);
    // One night's Dump: the dump and its counts share a timestamp.
    expect(dumps[0].replace(".dump.enc", "")).toBe(counts[0].replace(".counts.enc", ""));

    const dump = dumpFile(dir, dumps[0]);
    const raw = await readFile(dump);
    expect(raw.subarray(0, 5).toString()).not.toBe("PGDMP"); // not a plaintext pg_dump
    expect(raw.toString("latin1")).not.toContain("identity_user"); // no table name in the clear

    // The counts say what the operator's Akun and Pengaturan Operator look like now.
    const recorded = Object.fromEntries(
      (await decrypt(dumpFile(dir, counts[0]))).split("\n").filter(Boolean).map((line) => line.split("=")),
    );
    expect(recorded.identity_user).toBe("3");
    expect(recorded.operator_settings_version).toBe("1");
  }, 120_000);

  it("keeps 7 days of Dumps, and only its own", async () => {
    const dir = await freshRoot();
    const backups = path.join(dir, ENV_NAME, "backups/db");
    await mkdir(backups, { recursive: true });
    // An eighth night ago: past the window. A Dump and its counts.
    await writeFile(path.join(backups, "makam-20260101T000000Z.dump.enc"), "eight nights ago");
    await writeFile(path.join(backups, "makam-20260101T000000Z.counts.enc"), "eight nights ago");
    // Not this script's files, whatever their age: the FileStore tar of
    // makam-backup-files, and ticket 72's pre-migrate dump.
    await writeFile(path.join(backups, "files-20260101T000000Z.tar.gz"), "the files half");
    await writeFile(path.join(backups, "predeploy-20260101T000000Z.dump"), "the pre-migrate half");
    const eightNightsAgo = new Date(Date.now() - 8 * 86_400_000);
    await utimes(path.join(backups, "makam-20260101T000000Z.dump.enc"), eightNightsAgo, eightNightsAgo);
    await utimes(path.join(backups, "makam-20260101T000000Z.counts.enc"), eightNightsAgo, eightNightsAgo);

    expect((await backup(dir)).code).toBe(0);

    const left = (await readdir(backups)).sort();
    // Only tonight's pair of this script's files is left; the eight-night-old
    // pair is gone, and nothing of anyone else's is touched.
    expect(left.filter((name) => name.startsWith("makam-"))).toHaveLength(2);
    expect(left).toContain("files-20260101T000000Z.tar.gz");
    expect(left).toContain("predeploy-20260101T000000Z.dump");
  }, 120_000);

  it("writes no Dump at all unless the disk has twice the database in it", async () => {
    const dir = await freshRoot();
    const client = new Client({ connectionString: sourceUrl });
    await client.connect();
    const { rows } = await client.query<{ size: string }>("select pg_database_size('makam') as size");
    await client.end();
    const needed = 2 * Number(rows[0].size);

    // One byte short of the rule: refused, and nothing written at all.
    const refused = await backup(dir, [], { MAKAM_BACKUP_FREE_BYTES: String(needed - 1) });
    expect(refused.code).toBe(78);
    expect(refused.stderr).toMatch(/\d+ MiB free, less than twice the \d+ MiB/);
    expect(await readdir(path.join(dir, ENV_NAME, "backups/db")).catch(() => [])).toEqual([]);

    // Exactly twice: the rule is "less than", so this is enough.
    expect((await backup(dir, [], { MAKAM_BACKUP_FREE_BYTES: String(needed) })).code).toBe(0);
    expect(await filesIn(dir, ".dump.enc")).toHaveLength(1);
  }, 120_000);

  it("writes no Dump without a passphrase to encrypt it with", async () => {
    const dir = await freshRoot();
    const missing = await backup(dir, [], { MAKAM_BACKUP_PASSPHRASE_FILE: path.join(dir, "not-here") });
    expect(missing.code).toBe(78);
    expect(missing.stderr).toContain("refusing");

    const empty = path.join(dir, "empty-passphrase");
    await writeFile(empty, "");
    const blank = await backup(dir, [], { MAKAM_BACKUP_PASSPHRASE_FILE: empty });
    expect(blank.code).toBe(78);

    // `openssl enc` would silently use only the first line of a two-line file.
    const twoLines = path.join(dir, "two-line-passphrase");
    await writeFile(twoLines, `${PASSPHRASE}\nand-a-second-line\n`, { mode: 0o600 });
    const longer = await backup(dir, [], { MAKAM_BACKUP_PASSPHRASE_FILE: twoLines });
    expect(longer.code).toBe(78);
    expect(longer.stderr).toContain("more than one line");

    expect(await readdir(path.join(dir, ENV_NAME, "backups/db")).catch(() => [])).toEqual([]);
  }, 120_000);
});

/** The throwaway containers a restore check has left behind, running or stopped. */
async function restoreContainers(): Promise<string[]> {
  return lines(await docker(["ps", "-a", "--filter", "label=makam.role=restore-test", "--format", "{{.Names}}"]));
}

/**
 * Only the ones this run started. `docker ps` is host-wide, and a restore check
 * an operator runs by hand at the same time is not this test's business.
 */
async function newRestoreContainers(): Promise<string[]> {
  const before = await restoreContainersAtStart;
  return (await restoreContainers()).filter((name) => !before.includes(name));
}

/** The counts of a night's Dump (the newest, like the restore check takes), read back to prove which it used. */
async function recordedCounts(dir: string): Promise<Record<string, string>> {
  const counts = await filesIn(dir, ".counts.enc");
  const newest = counts[counts.length - 1];
  return Object.fromEntries((await decrypt(dumpFile(dir, newest))).split("\n").filter(Boolean).map((line) => line.split("=")));
}

describe("the restore check", () => {
  it("restores the newest Dump and finds in it every table and row that night had", async () => {
    const dir = await freshRoot();
    expect((await backup(dir)).code).toBe(0);
    expect((await recordedCounts(dir)).identity_user).toBe("3");

    // The next night: one Akun fewer, so "the newest Dump" is a real choice.
    const client = new Client({ connectionString: sourceUrl });
    await client.connect();
    await client.query("delete from identity_user where id = 'akun-t64-3'");
    await client.end();
    try {
      // The stamp is a second, so the two nights do not share a file name.
      await new Promise((resolve) => setTimeout(resolve, 1_100));
      expect((await backup(dir)).code).toBe(0);
      expect((await recordedCounts(dir)).identity_user).toBe("2");

      const result = await restoreCheck(dir);

      expect(result.stderr).not.toContain("refusing");
      expect(result.code).toBe(0);
      // The check read the newest Dump's counts, not the older night's.
      expect(result.stdout).toContain("identity_user=2");
      expect(result.stdout).not.toContain("identity_user=3");
      // Every table of the night came back, the core ones included.
      expect(result.stdout).toContain("operator_settings_version=1");
      expect(result.stdout).toContain("tables checked");
      // Nothing left behind, running or stopped.
      expect(await newRestoreContainers()).toEqual([]);
    } finally {
      const back = new Client({ connectionString: sourceUrl });
      await back.connect();
      await back.query(
        "insert into identity_user (id, name, placeholder_email, created_at, updated_at) values ('akun-t64-3', 'Akun 3', 'akun-t64-3@akun.makam.invalid', now(), now()) on conflict do nothing",
      );
      await back.end();
    }
  }, 300_000);

  it("fails when the Dump is not readable, and keeps the container when asked to", async () => {
    const dir = await freshRoot();
    expect((await backup(dir)).code).toBe(0);
    const [dump] = await filesIn(dir, ".dump.enc");
    // What a truncated write or a bad disk would leave behind.
    await writeFile(dumpFile(dir, dump), "PGDMP not really");

    const result = await restoreCheck(dir, ["--keep"]);
    expect(result.code).toBe(1);
    expect(result.stderr).toContain("ERROR restoring");

    try {
      // --keep: the failed restore is still there to be looked at.
      expect(await newRestoreContainers()).toHaveLength(1);
    } finally {
      for (const name of await newRestoreContainers()) await docker(["rm", "-f", name]);
    }
  }, 300_000);

  it("fails when the passphrase is not the one the Dump was encrypted with, and leaves nothing behind", async () => {
    const dir = await freshRoot();
    expect((await backup(dir)).code).toBe(0);
    const other = path.join(dir, "another-passphrase");
    await writeFile(other, "a-different-passphrase\n", { mode: 0o600 });

    const result = await restoreCheck(dir, [], { MAKAM_BACKUP_PASSPHRASE_FILE: other });

    expect(result.code).toBe(1);
    expect(await newRestoreContainers()).toEqual([]);
  }, 300_000);

  it("pings the GlitchTip heartbeat after a Dump, and never fails a Dump over it", async () => {
    const dir = await freshRoot();
    const pings: string[] = [];
    const server = createHttpServer((request, response) => {
      pings.push(request.url ?? "");
      response.end("ok");
    });
    const port = await new Promise<number>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve((server.address() as { port: number }).port));
    });
    try {
      // Where the operator leaves it on the host: a file beside the passphrase.
      await writeFile(path.join(dir, ENV_NAME, "glitchtip-heartbeat"), `http://127.0.0.1:${port}/api/0/heartbeat/makam/dump\n`);
      expect((await backup(dir)).code).toBe(0);
      expect(pings).toEqual(["/api/0/heartbeat/makam/dump"]);

      // A monitor that does not answer is a warning, not a failed backup: the
      // Dump is the work, the ping only says it happened.
      pings.length = 0;
      const silent = await backup(dir, [], { MAKAM_HEARTBEAT_URL: "http://127.0.0.1:1/heartbeat" });
      expect(silent.code).toBe(0);
      expect(silent.stderr).toContain("WARNING GlitchTip heartbeat");
      expect(pings).toEqual([]);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  }, 120_000);
});
