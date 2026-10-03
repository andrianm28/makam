import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The old app is switched off at the switch (ticket 65, owner decision
// 2026-10-03): its database is archived first, and what is deleted afterwards
// is deleted by name. The fakes here stand in for docker and aws, so a run is
// judged by what ends up in the "bucket", what the restore check says, which
// names docker was told to remove, and that nothing else was touched.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const script = path.join(repo, "deploy/bin/makam-arsip-app-lama");
const SOURCE = "makam-nonprod-db-1";
const OLD_COUNTS = "orders=3\npayments=1\nusers=5\n";
const CONFIRM = "hapus-app-lama";

function host() {
  const root = mkdtempSync(path.join(tmpdir(), "makam-arsip-"));
  const bin = path.join(root, "bin");
  const bucket = path.join(root, "bucket");
  const oldApp = path.join(root, "home-ubuntu-makam-app");
  const notify = path.join(root, "opt-makam-notify");
  mkdirSync(bin);
  mkdirSync(bucket);
  mkdirSync(path.join(root, "prod"), { recursive: true });
  mkdirSync(path.join(root, "nginx-backups"));
  mkdirSync(oldApp);
  mkdirSync(notify);
  writeFileSync(path.join(oldApp, "marker"), "old app");
  writeFileSync(path.join(root, "prod", "backup-passphrase"), "correct horse battery staple\n", { mode: 0o600 });
  // The old app's nginx blocks (upstreams 3001 / 8083 / 8081), and v1's own.
  writeFileSync(path.join(root, "nginx-backups", "makam.co.id.conf.20261003T010000Z"), "proxy_pass http://127.0.0.1:8083;\n");
  writeFileSync(path.join(root, "nginx-backups", "dev.makam.co.id.conf.20260925T111554Z"), "proxy_pass http://127.0.0.1:8081;\n");
  writeFileSync(path.join(root, "nginx-backups", "makam.co.id.conf.20261003T020000Z"), "proxy_pass http://127.0.0.1:3100;\n");

  writeFileSync(
    path.join(bin, "docker"),
    [
      "#!/usr/bin/env bash",
      'echo "docker $*" >> "$FAKE_DOCKER_LOG"',
      'case "$1" in',
      "  info) echo /nonexistent-docker-root ;;",
      "  inspect) echo true ;;",
      '  ps) printf "%s\\n" $FAKE_PS ;;',
      '  images) printf "%s\\n" $FAKE_IMAGES ;;',
      '  volume) if [ "$2" = ls ]; then printf "%s\\n" $FAKE_VOLUMES; fi ;;',
      "  run) echo fakecontainerid ;;",
      "  rm|rmi) ;;",
      "  exec)",
      "    shift",
      '    [ "$1" = -i ] && { shift; stdin=1; }',
      "    name=$1; shift",
      '    case "$*" in',
      '      pg_isready*) exit 0 ;;',
      '      *pg_dump*) printf DUMPDATA ;;',
      '      *pg_restore*) cat > "$FAKE_RESTORE_IN" ;;',
      '      *pg_database_size*) echo 1000 ;;',
      '      *pg_tables*) case "$name" in makam-restoretest-*) printf "%s" "${FAKE_RESTORED_COUNTS:-$FAKE_OLD_COUNTS}" ;; *) printf "%s" "$FAKE_OLD_COUNTS" ;; esac ;;',
      "    esac ;;",
      "esac",
      "exit 0",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(bin, "aws"),
    [
      "#!/usr/bin/env bash",
      'echo "aws $*" >> "$FAKE_AWS_LOG"',
      '[ "${FAKE_AWS_FAIL:-0}" = 1 ] && exit 1',
      'if [ "$1 $2" = "s3 cp" ]; then cp "$3" "$FAKE_BUCKET/$(basename "$4")"; fi',
      "exit 0",
      "",
    ].join("\n"),
  );
  chmodSync(path.join(bin, "docker"), 0o755);
  chmodSync(path.join(bin, "aws"), 0o755);
  return { root, bin, bucket, oldApp, notify, dockerLog: path.join(root, "docker.log"), awsLog: path.join(root, "aws.log"), restoreIn: path.join(root, "restore.in") };
}

type World = ReturnType<typeof host>;

function run(w: World, args: string[] = [], stdin = "", extra: Record<string, string> = {}) {
  writeFileSync(w.dockerLog, "");
  writeFileSync(w.awsLog, "");
  const result = spawnSync("bash", [script, "--container", SOURCE, "--bucket", "makam-backups", ...args], {
    encoding: "utf8",
    input: stdin,
    env: {
      PATH: `${w.bin}:/usr/bin:/bin`,
      NODE_ENV: "test",
      MAKAM_ROOT: w.root,
      MAKAM_OLD_APP_DIR: w.oldApp,
      MAKAM_OLD_NOTIFY_DIR: w.notify,
      MAKAM_BACKUP_FREE_BYTES: "1000000000",
      FAKE_DOCKER_LOG: w.dockerLog,
      FAKE_AWS_LOG: w.awsLog,
      FAKE_BUCKET: w.bucket,
      FAKE_RESTORE_IN: w.restoreIn,
      FAKE_OLD_COUNTS: OLD_COUNTS,
      FAKE_PS: `${SOURCE} makam-nonprod-web-1 makam-prod-web-1 makam-staging-postgres-1 makam-v1-thing`,
      FAKE_VOLUMES: "makam-nonprod-pgdata makam-prod_pgdata makam-staging_files",
      FAKE_IMAGES: "makam-app:latest makam-app:old ghcr.io/andrianm28/makam:sha-abc postgres:18.6",
      ...extra,
    },
  });
  return { code: result.status, output: `${result.stdout}${result.stderr}`, docker: readFileSync(w.dockerLog, "utf8"), aws: readFileSync(w.awsLog, "utf8") };
}

const uploaded = (w: World) => readdirSync(w.bucket);

describe("makam-arsip-app-lama (the archive, before any deletion)", () => {
  it("encrypts the old database's dump, uploads it, restores it into a throwaway Postgres and row-counts it", () => {
    const w = host();
    const r = run(w);
    expect(r.code).toBe(0);

    // The bucket holds an encrypted dump that only the backup key opens.
    const dump = uploaded(w).find((f) => f.endsWith(".dump.enc"));
    expect(dump).toBeDefined();
    const bytes = readFileSync(path.join(w.bucket, dump!));
    expect(bytes.toString("utf8")).not.toContain("DUMPDATA");
    const decrypted = spawnSync(
      "openssl",
      ["enc", "-d", "-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-md", "sha256", "-pass", "pass:correct horse battery staple"],
      { input: bytes },
    );
    expect(decrypted.stdout.toString("utf8")).toBe("DUMPDATA");
    expect(uploaded(w).some((f) => f.endsWith(".counts.enc"))).toBe(true);
    expect(r.aws).toMatch(/s3 cp .* s3:\/\/makam-backups\/app-lama\//);

    // The same bytes went into a throwaway container with no network, and it is gone again.
    expect(readFileSync(w.restoreIn, "utf8")).toBe("DUMPDATA");
    expect(r.docker).toMatch(/run -d --name makam-restoretest-app-lama-\S+ .*--network none/);
    expect(r.docker).toMatch(/rm -f makam-restoretest-app-lama-\S+/);
    expect(r.output).toContain("orders=3");
    expect(r.output).toContain("users=5");
  });
});

describe("makam-arsip-app-lama fails closed", () => {
  it("refuses a restore that is short of rows: no success, no cleanup plan", () => {
    const w = host();
    const r = run(w, ["--hapus"], `${CONFIRM}\n`, { FAKE_RESTORED_COUNTS: "orders=3\nusers=4\n" });
    expect(r.code).not.toBe(0);
    expect(r.output).toMatch(/short of rows/);
    expect(r.output).not.toMatch(/makam-nonprod-web-1/);
    expect(r.docker).not.toMatch(/rm -f makam-nonprod|volume rm|rmi /);
    expect(existsSync(path.join(w.oldApp, "marker"))).toBe(true);
  });

  it("stops when the upload fails: nothing is proven, so nothing is restored or deleted", () => {
    const w = host();
    const r = run(w, ["--hapus"], `${CONFIRM}\n`, { FAKE_AWS_FAIL: "1" });
    expect(r.code).not.toBe(0);
    expect(r.docker).not.toMatch(/\brun\b|volume rm|rmi /);
    expect(existsSync(path.join(w.oldApp, "marker"))).toBe(true);
  });

  it("refuses without the backup key, and with a key others can read", () => {
    const w = host();
    chmodSync(path.join(w.root, "prod", "backup-passphrase"), 0o644);
    const r = run(w);
    expect(r.code).toBe(78);
    expect(uploaded(w)).toEqual([]);
  });
});

describe("makam-arsip-app-lama's cleanup plan", () => {
  it("prints the old app's objects by name after the proof, and deletes nothing without --hapus", () => {
    const w = host();
    const r = run(w);
    expect(r.code).toBe(0);
    for (const named of [
      "makam-nonprod-db-1",
      "makam-nonprod-web-1",
      "makam-nonprod-pgdata",
      "makam-app:latest",
      "makam-app:old",
      w.oldApp,
      w.notify,
      "makam.co.id.conf.20261003T010000Z",
      "dev.makam.co.id.conf.20260925T111554Z",
    ]) {
      expect(r.output).toContain(named);
    }
    // Nothing of v1, production or staging is in the plan.
    for (const foreign of ["makam-prod-web-1", "makam-staging-postgres-1", "makam-v1-thing", "makam-prod_pgdata", "makam-staging_files", "ghcr.io/andrianm28/makam", "postgres:18.6", "makam.co.id.conf.20261003T020000Z"]) {
      expect(r.output).not.toContain(foreign);
    }
    expect(r.docker).not.toMatch(/volume rm|rmi |rm -f makam-nonprod/);
    expect(existsSync(path.join(w.oldApp, "marker"))).toBe(true);
  });
});

describe("makam-arsip-app-lama --hapus", () => {
  it("deletes nothing unless the word is typed exactly", () => {
    const w = host();
    const r = run(w, ["--hapus"], "ya\n");
    expect(r.code).not.toBe(0);
    expect(r.docker).not.toMatch(/volume rm|rmi |rm -f makam-nonprod/);
    expect(existsSync(path.join(w.oldApp, "marker"))).toBe(true);
    expect(existsSync(path.join(w.root, "nginx-backups", "makam.co.id.conf.20261003T010000Z"))).toBe(true);
  });

  it("removes exactly the planned objects by name, and never prunes or takes -a/--all", () => {
    const w = host();
    const r = run(w, ["--hapus"], `${CONFIRM}\n`);
    expect(r.code).toBe(0);
    const removals = r.docker.split("\n").filter((l) => /^docker (rm -f makam-nonprod|volume rm|rmi )/.test(l));
    expect(removals.sort()).toEqual(
      [
        "docker rm -f makam-nonprod-db-1",
        "docker rm -f makam-nonprod-web-1",
        "docker volume rm makam-nonprod-pgdata",
        "docker rmi makam-app:latest",
        "docker rmi makam-app:old",
      ].sort(),
    );
    expect(r.docker).not.toMatch(/prune|\s-a\b|--all/);
    expect(existsSync(w.oldApp)).toBe(false);
    expect(existsSync(w.notify)).toBe(false);
    // The old app's nginx blocks go; v1's backup stays.
    const left = readdirSync(path.join(w.root, "nginx-backups"));
    expect(left).toEqual(["makam.co.id.conf.20261003T020000Z"]);
    // The archive stays.
    expect(readdirSync(path.join(w.root, "archive", "app-lama")).some((f) => f.endsWith(".dump.enc"))).toBe(true);
  });
});
