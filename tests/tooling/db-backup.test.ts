// The nightly database Dump of the beta (ticket 64, ADR 0002 beta UAT
// amendment): deploy/bin/makam-backup-db and deploy/bin/makam-restore-test,
// driven through their own command line, the way the host's systemd timers and
// CI run them.
//
// The Dump is taken from a Postgres container this file starts (the same image
// by digest as staging and CI, its own name and labels, published on 127.0.0.1
// only so this test can migrate it and put rows in it). Both that container and
// the ones the restore check starts carry makam.worktree, so `npm run clean`
// reaches them if a run dies on this host that four agents share — and so this
// file can tell its own containers from a colleague's, which is what
// restoreContainers() asks Docker for (never a host-wide guess: another
// worktree's restore check, or an operator's by hand, is not this run's
// business and must not be counted as its own, or removed by it).
// Nothing here needs the host's makam-staging or makam-prod project, and the
// throwaway restore container gets no network at all.
import { execFile } from "node:child_process";
import { createServer } from "node:net";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
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
/** Containers the ownership test below starts under another worktree's label. */
const foreignNames: string[] = [];

let sourceUrl = "";
/** This worktree's restore containers, of whichever run, that already existed when this file started. */
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
  await writeFile(path.join(dir, ENV_NAME, PASSPHRASE_FILE), `${PASSPHRASE}\n`, { mode: 0o600 });
  return dir;
}

type Run = { code: number; stdout: string; stderr: string };

/**
 * What one script gets before it is killed, per kind of run and inside the
 * calling test's own budget on purpose: a script that hangs then dies as itself
 * (its exit code and its stderr reach the assertions) instead of the test
 * hitting its own ceiling with nothing left to read. Measured on this host,
 * alone: a Dump 4 s, the heaviest restore check 19 s, and the numbers below are
 * roughly 12 to 20 times that, because this host runs four agents' suites at
 * once and a Docker round trip costs seconds when it is busy. The suite's
 * default 30 s is not a budget for anything that starts a container here.
 */
const DUMP_LEASH = 90_000;
const RESTORE_LEASH = 240_000;

function runScript(script: string, args: string[], env: Record<string, string>, leash: number): Promise<Run> {
  return new Promise((resolve) => {
    execFile(
      script,
      args,
      {
        // MAKAM_WORKTREE: the restore script labels its throwaway container as
        // this worktree's, so `npm run clean` reaches it if this run dies, and
        // so this file can tell it from a colleague's.
        env: { ...process.env, MAKAM_ROOT: "", MAKAM_WORKTREE: root, ...env },
        timeout: leash,
      },
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
  runScript(backupScript, ["--env", ENV_NAME, "--container", sourceName, ...args], { MAKAM_ROOT: dir, ...env }, DUMP_LEASH);

const restoreCheck = (dir: string, args: string[] = [], env: Record<string, string> = {}) =>
  runScript(restoreScript, ["--env", ENV_NAME, ...args], { MAKAM_ROOT: dir, ...env }, RESTORE_LEASH);

/** Where the scripts look for the passphrase, this test's own MAKAM_ROOT. */
const passphraseOf = (dir: string) => path.join(dir, ENV_NAME, PASSPHRASE_FILE);

/** Replaces the passphrase, with the mode asked for: what an operator's umask gives. */
async function setPassphrase(dir: string, contents: string, mode = 0o600): Promise<string> {
  const file = passphraseOf(dir);
  await writeFile(file, contents);
  await chmod(file, mode);
  return file;
}

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
    // Labelled as this worktree's, so `npm run clean` reaches it after a
    // crashed run: no compose project to prove it by.
    "--label", `makam.worktree=${root}`,
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
  // container on a host four agents share. `rm -fv`, not `rm -f`: the Postgres
  // image brings an anonymous volume, which `-f` alone leaves behind (five of
  // them per run, on a disk that is shared).
  for (const name of [...foreignNames, ...(await newRestoreContainers())]) await docker(["rm", "-fv", name]);
  await docker(["rm", "-fv", sourceName]);
  // The hook's own budget, not the suite's: this is several `docker rm -fv`
  // calls, and a busy host makes each of them seconds.
}, 180_000);

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
    expect(refused.stderr).toMatch(/\d+ (KiB|MiB|GiB) free, less than twice the \d+ (KiB|MiB|GiB)/);
    expect(await readdir(path.join(dir, ENV_NAME, "backups/db")).catch(() => [])).toEqual([]);

    // Exactly twice: the rule is "less than", so this is enough.
    expect((await backup(dir, [], { MAKAM_BACKUP_FREE_BYTES: String(needed) })).code).toBe(0);
    expect(await filesIn(dir, ".dump.enc")).toHaveLength(1);
  }, 120_000);

  it("refuses with the documented exit code when the free space cannot be read at all", async () => {
    const dir = await freshRoot();
    // A probe that answers with something no byte count: fail closed with the
    // runbook's exit 78 and its own message, not whatever `set -e` decides.
    const unreadable = await backup(dir, [], { MAKAM_BACKUP_FREE_BYTES: "unknown" });
    expect(unreadable.code).toBe(78);
    expect(unreadable.stderr).toContain("could not read the free space");
    expect(await readdir(path.join(dir, ENV_NAME, "backups/db")).catch(() => [])).toEqual([]);
  }, 120_000);

  it("writes no Dump without a passphrase to encrypt it with", async () => {
    const dir = await freshRoot();
    await rm(passphraseOf(dir));
    const missing = await backup(dir);
    expect(missing.code).toBe(78);
    expect(missing.stderr).toContain("refusing");
    expect(missing.stderr).toContain(passphraseOf(dir));

    await setPassphrase(dir, "");
    expect((await backup(dir)).code).toBe(78);

    // `openssl enc` would silently use only the first line of a two-line file.
    await setPassphrase(dir, `${PASSPHRASE}\nand-a-second-line\n`);
    const longer = await backup(dir);
    expect(longer.code).toBe(78);
    expect(longer.stderr).toContain("more than one line");

    expect(await readdir(path.join(dir, ENV_NAME, "backups/db")).catch(() => [])).toEqual([]);
  }, 120_000);

  it("refuses a passphrase any other account on this host could read", async () => {
    const dir = await freshRoot();
    // What an operator gets by accident: `openssl rand > file` under umask 022.
    const file = await setPassphrase(dir, `${PASSPHRASE}\n`, 0o644);

    const result = await backup(dir);

    expect(result.code).toBe(78);
    expect(result.stderr).toContain("mode 644");
    expect(result.stderr).toContain(`chmod 600 ${file}`);
    expect(await readdir(path.join(dir, ENV_NAME, "backups/db")).catch(() => [])).toEqual([]);
  }, 120_000);

  it("collects a .part file an interrupted run left, and leaves a colleague's alone", async () => {
    const dir = await freshRoot();
    const backups = path.join(dir, ENV_NAME, "backups/db");
    await mkdir(backups, { recursive: true });
    // An orphan from a run that was killed (TimeoutStartSec, systemctl stop):
    // the trap could not run, so the next night's pruning has to.
    const orphan = path.join(backups, "makam-20260101T000000Z.dump.enc.part");
    await writeFile(orphan, "half a dump");
    const old = new Date(Date.now() - 8 * 86_400_000);
    await utimes(orphan, old, old);
    // A run going on right now: younger than the window, so not ours to touch.
    const running = path.join(backups, "makam-99999999T000000Z.counts.enc.part");
    await writeFile(running, "a colleague's run");

    expect((await backup(dir)).code).toBe(0);

    expect(await readdir(backups)).toContain(path.basename(running));
    expect(await readdir(backups)).not.toContain(path.basename(orphan));
  }, 120_000);
});

/** The throwaway containers a restore check has left behind, running or stopped. */
async function restoreContainers(): Promise<string[]> {
  return lines(await docker([
    "ps", "-a",
    "--filter", "label=makam.role=restore-test",
    // The role label alone is host-wide, and this host is shared: another
    // worktree's restore check (or an operator's by hand) carries it too. Only
    // this worktree's label says whose they are, and a colleague's container
    // must neither fail the assertions below nor be removed by afterAll.
    "--filter", `label=makam.worktree=${root}`,
    "--format", "{{.Names}}",
  ]));
}

/**
 * Only the ones this run started. A container of a crashed earlier run of this
 * same worktree was already there when this file began, so it is not this run's
 * to report on (or to leave behind: afterAll removes those too, since they are
 * proven to be this worktree's).
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
      for (const name of await newRestoreContainers()) await docker(["rm", "-fv", name]);
    }
  }, 300_000);

  it("fails when the passphrase is not the one the Dump was encrypted with, and leaves nothing behind", async () => {
    const dir = await freshRoot();
    expect((await backup(dir)).code).toBe(0);
    await setPassphrase(dir, "a-different-passphrase\n");

    const result = await restoreCheck(dir);

    expect(result.code).toBe(1);
    expect(await newRestoreContainers()).toEqual([]);
  }, 300_000);

  it("runs the restore where nothing can reach it, and leaves it where clean can find it", async () => {
    const dir = await freshRoot();
    expect((await backup(dir)).code).toBe(0);
    const [dump] = await filesIn(dir, ".dump.enc");
    await writeFile(dumpFile(dir, dump), "PGDMP not really");

    // --keep so there is a container to inspect.
    expect((await restoreCheck(dir, ["--keep"])).code).toBe(1);

    try {
      const [name] = await newRestoreContainers();
      expect(name).toBeDefined();
      const inspected = JSON.parse(await docker(["inspect", name]))[0] as {
        HostConfig: { NetworkMode: string; PortBindings: Record<string, unknown> | null; PublishAllPorts: boolean };
        Mounts: { Type: string; Name?: string; Source?: string; Destination: string }[];
        Config: { Labels: Record<string, string> };
      };
      // No network at all: the restored database is reachable from nothing,
      // not even from another container on this host.
      expect(inspected.HostConfig.NetworkMode).toBe("none");
      expect(inspected.HostConfig.PortBindings ?? {}).toEqual({});
      expect(inspected.HostConfig.PublishAllPorts).toBe(false);
      // Nothing of the environment's is mounted in: no makam volume, and every
      // mount under Docker's own directory. The one that is there is the
      // anonymous volume the Postgres image brings for its data, which is why the
      // free-space check reads Docker's directory and not /opt/makam-v1.
      const dockerDir = await docker(["info", "--format", "{{.DockerRootDir}}"]);
      expect(inspected.Mounts.length).toBeGreaterThan(0);
      expect(inspected.Mounts.every((mount) => mount.Type === "volume")).toBe(true);
      expect(inspected.Mounts.map((mount) => mount.Name ?? "").join(" ")).not.toContain("makam");
      expect(
        inspected.Mounts.filter((mount) => !(mount.Source ?? "").startsWith(`${dockerDir}/`)),
      ).toEqual([]);
      // Labelled as this worktree's, so `npm run clean` reaches it if this run
      // dies before its own afterAll (planStackCleanup, tests/tooling/worktree.test.ts).
      expect(inspected.Config.Labels["makam.worktree"]).toBe(root);
    } finally {
      for (const name of await newRestoreContainers()) await docker(["rm", "-fv", name]);
    }
  }, 300_000);
});

/**
 * What "leaves nothing behind" is allowed to mean. The assertions above can
 * only be trusted if they mean this run's own containers, and on a host where
 * four agents run this suite at once they are not the only restore checks on
 * the machine. This makes that collision the way a busy host does —
 * deterministically, in a second, without waiting for one.
 */
describe("a restore check this run does not own", () => {
  it("is neither counted as this run's nor removed by it", async () => {
    // A colleague's, or an operator's by hand: the same role label, another
    // worktree's (a path no worktree has, so no `npm run clean` out there can
    // reach it either), and this run's own for the other half. `create`, never
    // start: the labels are the whole point, and an unstarted container costs
    // nothing on a busy host.
    const colleague = `makam-restoretest-staging-colleague-${process.pid}`;
    const mine = `makam-restoretest-staging-own-${process.pid}`;
    const create = (name: string, worktree: string) =>
      docker([
        "create", "--name", name,
        "--label", "makam.role=restore-test",
        "--label", `makam.worktree=${worktree}`,
        "--network", "none", PG_IMAGE, "sleep", "1",
      ]);
    foreignNames.push(colleague, mine);
    await create(colleague, path.join(root, "not-this-worktree"));
    await create(mine, root);

    try {
      // Both were created after this file began, so a host-wide role filter
      // would call them both this run's: "nothing left behind" would fail on
      // somebody else's container, and so would the count of one kept.
      expect(await newRestoreContainers()).toEqual([mine]);
    } finally {
      // Exactly what afterAll does: remove what this run started, and no more.
      for (const name of await newRestoreContainers()) await docker(["rm", "-fv", name]);
    }

    // The colleague's container is still there: it was never this run's to
    // count and never this run's to remove.
    expect(await newRestoreContainers()).toEqual([]);
    await expect(docker(["inspect", colleague])).resolves.toContain(colleague);
  }, 120_000);
});
