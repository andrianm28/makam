// The off-host copy of the backups (audit finding A-3, launch gate 3):
// deploy/bin/makam-backup-offsite and deploy/bin/makam-offsite-restore-test,
// driven through their own command line the way the host's timers run them.
//
// The storage account is a fake `rclone` that maps `<remote>:<path>` onto a
// directory, so the test can read what "left the host" byte for byte. The
// restore itself is makam-restore-test's (tests/tooling/db-backup.test.ts
// restores a real Dump into a real Postgres); here a fake one beside the script
// records what it was handed, so this file needs no Docker.
import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repo = fileURLToPath(new URL("../..", import.meta.url));
const PASSPHRASE = "test-passphrase-for-the-offsite-copy";
/** The encryption the scripts use, so the test reads a shipped file exactly as the operator would. */
const CIPHER_ARGS = ["-aes-256-cbc", "-pbkdf2", "-iter", "600000", "-md", "sha256"];
const STAMP = "20261029T181500Z";
const FILES_STAMP = "20261029T184500Z";

const FAKE_RCLONE = `#!/usr/bin/env bash
# A storage account that is a directory: <remote>:<path> is $FAKE_REMOTE/<path>.
set -euo pipefail
args=()
while [ $# -gt 0 ]; do
  case "$1" in
    --config) [ -r "$2" ] || { echo "no config $2" >&2; exit 1; }; shift 2 ;;
    *) args+=("$1"); shift ;;
  esac
done
set -- "\${args[@]}"
echo "$*" >> "$FAKE_REMOTE.calls"
at() { case "$1" in *:*) echo "$FAKE_REMOTE/\${1#*:}" ;; *) echo "$1" ;; esac; }
cmd=$1; shift
case "$cmd" in
  copyto)
    [ -z "\${FAKE_RCLONE_FAIL:-}" ] || exit 1
    dst=$(at "$2"); mkdir -p "$(dirname "$dst")"; cp "$(at "$1")" "$dst"
    if [ -n "\${FAKE_RCLONE_TRUNCATE:-}" ] && [ "$dst" != "$2" ]; then truncate -s -1 "$dst"; fi ;;
  lsf)
    format=name; target=""
    while [ $# -gt 0 ]; do
      case "$1" in --format) format=$2; shift 2 ;; --files-only) shift ;; *) target=$(at "$1"); shift ;; esac
    done
    if [ -f "$target" ]; then
      [ "$format" = s ] && stat -c %s "$target" || basename "$target"
    elif [ -d "$target" ]; then
      find "$target" -maxdepth 1 -type f -printf '%f\\n'
    fi ;;
  delete)
    dir=$(at "$1"); days=\${3%d}
    [ -d "$dir" ] && find "$dir" -type f -mmin +$((days * 1440)) -delete ;;
  *) echo "fake rclone: $cmd" >&2; exit 2 ;;
esac
`;

const FAKE_RESTORE_TEST = `#!/usr/bin/env bash
# Records what it was handed and whether the counts sit beside the Dump.
env=""; dump=""
while [ $# -gt 0 ]; do case "$1" in --env) env=$2; shift 2 ;; --dump) dump=$2; shift 2 ;; *) shift ;; esac; done
echo "--env $env dump=$(basename "$dump") counts=$([ -r "\${dump%.dump.enc}.counts.enc" ] && echo yes || echo no) content=$(cat "$dump")" >> "$FAKE_RESTORE_LOG"
exit \${FAKE_RESTORE_EXIT:-0}
`;

const temps: string[] = [];
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

function write(file: string, text: string | Buffer, mode = 0o600) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  chmodSync(file, mode);
}

/** A host under a temp directory: MAKAM_ROOT, the scripts in its bin, a fake rclone and logger on PATH, and a remote. */
function host(env: "staging" | "prod" = "prod") {
  const base = mkdtempSync(path.join(tmpdir(), "makam-offsite-"));
  temps.push(base);
  const root = path.join(base, "opt-makam-v1");
  const bin = path.join(root, "bin");
  const fakebin = path.join(base, "fakebin");
  const remote = path.join(base, "remote");
  const restoreLog = path.join(base, "restore.log");
  mkdirSync(bin, { recursive: true });
  mkdirSync(fakebin);
  mkdirSync(remote);
  for (const script of ["makam-backup-offsite", "makam-offsite-restore-test", "makam-backup-lib"]) {
    copyFileSync(path.join(repo, "deploy/bin", script), path.join(bin, script));
    chmodSync(path.join(bin, script), 0o755);
  }
  write(path.join(bin, "makam-restore-test"), FAKE_RESTORE_TEST, 0o755);
  write(path.join(fakebin, "rclone"), FAKE_RCLONE, 0o755);
  write(path.join(fakebin, "logger"), "#!/usr/bin/env bash\nexit 0\n", 0o755);

  const envDir = path.join(root, env);
  write(path.join(envDir, "backup-passphrase"), PASSPHRASE);
  write(path.join(envDir, "offsite.env"), "OFFSITE_REMOTE=makam-offsite:makam-backup/prod\n");
  write(path.join(envDir, "rclone.conf"), "[makam-offsite]\ntype = s3\n");
  write(path.join(envDir, `backups/db/makam-${STAMP}.dump.enc`), "the encrypted dump");
  write(path.join(envDir, `backups/db/makam-${STAMP}.counts.enc`), "the encrypted counts");
  // A real tar, so the restore check can decrypt and list what was shipped.
  const store = path.join(base, "store");
  write(path.join(store, "ktp/abc.jpg"), "a family document");
  const tar = path.join(envDir, `backups/files/files-${FILES_STAMP}.tar.gz`);
  mkdirSync(path.dirname(tar), { recursive: true });
  expect(spawnSync("tar", ["-czf", tar, "-C", store, "."]).status).toBe(0);

  const run = (script: string, extra: Record<string, string> = {}) => {
    const result = spawnSync(path.join(bin, script), ["--env", env], {
      encoding: "utf8",
      env: {
        ...process.env,
        MAKAM_ROOT: root,
        MAKAM_BACKUP_FREE_BYTES: String(1024 ** 3),
        PATH: `${fakebin}:${process.env.PATH}`,
        FAKE_REMOTE: remote,
        FAKE_RESTORE_LOG: restoreLog,
        ...extra,
      },
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  };
  const shipped = (kind: string): string[] => (existsSync(path.join(remote, "makam-backup/prod", kind)) ? readdirSync(path.join(remote, "makam-backup/prod", kind)).sort() : []);
  return {
    root,
    envDir,
    tar,
    remoteDir: path.join(remote, "makam-backup/prod"),
    shipped,
    backup: (extra?: Record<string, string>) => run("makam-backup-offsite", extra),
    restore: (extra?: Record<string, string>) => run("makam-offsite-restore-test", extra),
    restoreCalls: (): string[] => (existsSync(restoreLog) ? readFileSync(restoreLog, "utf8").split("\n").filter(Boolean) : []),
  };
}

function decrypt(file: string): Buffer {
  const result = spawnSync("openssl", ["enc", "-d", ...CIPHER_ARGS, "-in", file, "-pass", "env:P"], { env: { ...process.env, P: PASSPHRASE } });
  expect(result.status, result.stderr?.toString()).toBe(0);
  return result.stdout;
}

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 3600 * 1000);

describe("makam-backup-offsite", () => {
  it("ships the newest Dump, its row counts and the FileStore tar, encrypted, to the off-host storage", () => {
    const h = host();
    const result = h.backup();
    expect(result.status, result.output).toBe(0);

    expect(h.shipped("db")).toEqual([`makam-${STAMP}.counts.enc`, `makam-${STAMP}.dump.enc`]);
    expect(readFileSync(path.join(h.remoteDir, `db/makam-${STAMP}.dump.enc`), "utf8")).toBe("the encrypted dump");
    expect(h.shipped("files")).toEqual([`files-${FILES_STAMP}.tar.gz.enc`]);
    const shippedTar = path.join(h.remoteDir, `files/files-${FILES_STAMP}.tar.gz.enc`);
    // Nothing readable leaves the host: the tar is not a gzip off-host, and decrypts to the very tar kept here.
    expect(readFileSync(shippedTar).subarray(0, 2)).not.toEqual(Buffer.from([0x1f, 0x8b]));
    expect(decrypt(shippedTar).equals(readFileSync(h.tar))).toBe(true);

    expect(existsSync(path.join(h.envDir, "offsite-last-success"))).toBe(true);
    expect(existsSync(path.join(h.envDir, "backups/offsite-tmp"))).toBe(false);
  });

  it("deletes off-host files older than the retention, and keeps the younger ones", () => {
    const h = host();
    write(path.join(h.remoteDir, "db/makam-20260901T181500Z.dump.enc"), "old");
    write(path.join(h.remoteDir, "db/makam-20261020T181500Z.dump.enc"), "young");
    utimesSync(path.join(h.remoteDir, "db/makam-20260901T181500Z.dump.enc"), daysAgo(40), daysAgo(40));
    utimesSync(path.join(h.remoteDir, "db/makam-20261020T181500Z.dump.enc"), daysAgo(9), daysAgo(9));

    expect(h.backup().status).toBe(0);
    expect(h.shipped("db")).toEqual([`makam-20261020T181500Z.dump.enc`, `makam-${STAMP}.counts.enc`, `makam-${STAMP}.dump.enc`]);
  });

  it("fails when the far side holds a different number of bytes than the file here", () => {
    const h = host();
    const result = h.backup({ FAKE_RCLONE_TRUNCATE: "1" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("bytes here but");
    expect(existsSync(path.join(h.envDir, "offsite-last-success"))).toBe(false);
  });

  it("fails when the copy itself fails, and records no success", () => {
    const h = host();
    const result = h.backup({ FAKE_RCLONE_FAIL: "1" });
    expect(result.status).toBe(1);
    expect(existsSync(path.join(h.envDir, "offsite-last-success"))).toBe(false);
  });

  const refusals: [string, (h: ReturnType<typeof host>) => void, string][] = [
    ["offsite.env is missing", (h) => rmSync(path.join(h.envDir, "offsite.env")), "missing"],
    ["rclone.conf is readable by others", (h) => chmodSync(path.join(h.envDir, "rclone.conf"), 0o644), "chmod 600"],
    ["OFFSITE_REMOTE is not <remote>:<path>", (h) => write(path.join(h.envDir, "offsite.env"), "OFFSITE_REMOTE=/mnt/usb\n"), "OFFSITE_REMOTE"],
    ["the retention is shorter than the week kept on the host", (h) => write(path.join(h.envDir, "offsite.env"), "OFFSITE_REMOTE=makam-offsite:makam-backup/prod\nOFFSITE_RETENTION_DAYS=5\n"), "at least 8"],
    ["the passphrase is missing", (h) => rmSync(path.join(h.envDir, "backup-passphrase")), "backup-passphrase"],
    [
      "the newest Dump is over 36 h old",
      (h) => {
        const dump = path.join(h.envDir, `backups/db/makam-${STAMP}.dump.enc`);
        utimesSync(dump, daysAgo(2), daysAgo(2));
      },
      "over 36 h old",
    ],
    ["there is no FileStore tar", (h) => rmSync(h.tar), "no FileStore tar"],
  ];
  it.each(refusals)("refuses (exit 78) and ships nothing when %s", (_case, breakIt, message) => {
    const h = host();
    breakIt(h);
    const result = h.backup();
    expect(result.status, result.output).toBe(78);
    expect(result.output).toContain(message);
    expect(h.shipped("db")).toEqual([]);
    expect(h.shipped("files")).toEqual([]);
  });
});

describe("makam-offsite-restore-test", () => {
  it("downloads the newest off-host Dump with its counts, hands it to makam-restore-test, and lists the FileStore tar", () => {
    const h = host();
    expect(h.backup().status).toBe(0);
    // An older night off-host as well: the newest one is the one restored.
    write(path.join(h.remoteDir, "db/makam-20261020T181500Z.dump.enc"), "an older dump");
    write(path.join(h.remoteDir, "db/makam-20261020T181500Z.counts.enc"), "older counts");
    const before = h.shipped("db");

    const result = h.restore();
    expect(result.status, result.output).toBe(0);
    expect(h.restoreCalls()).toEqual([`--env prod dump=makam-${STAMP}.dump.enc counts=yes content=the encrypted dump`]);
    expect(result.output).toMatch(/listed [1-9]\d* entries/);
    // It only reads the remote, and leaves no download behind.
    expect(h.shipped("db")).toEqual(before);
    expect(readdirSync(path.join(h.envDir, "backups")).filter((name) => name.startsWith("offsite-restore"))).toEqual([]);
    expect(existsSync(path.join(h.envDir, "offsite-last-restore-ok"))).toBe(true);
  });

  it("refuses (exit 78) when nothing has been shipped off-host yet", () => {
    const h = host();
    const result = h.restore();
    expect(result.status, result.output).toBe(78);
    expect(result.output).toContain("has not shipped one");
    expect(h.restoreCalls()).toEqual([]);
  });

  it("fails when the off-host Dump does not restore, and records no success", () => {
    const h = host();
    expect(h.backup().status).toBe(0);
    const result = h.restore({ FAKE_RESTORE_EXIT: "1" });
    expect(result.status).toBe(1);
    expect(result.output).toContain("did not restore");
    expect(existsSync(path.join(h.envDir, "offsite-last-restore-ok"))).toBe(false);
  });

  it("fails when the off-host FileStore tar does not decrypt to an archive", () => {
    const h = host();
    expect(h.backup().status).toBe(0);
    write(path.join(h.remoteDir, `files/files-${FILES_STAMP}.tar.gz.enc`), "not a tar at all");
    const result = h.restore();
    expect(result.status).toBe(1);
    expect(result.output).toContain("empty or unreadable");
    expect(existsSync(path.join(h.envDir, "offsite-last-restore-ok"))).toBe(false);
  });
});
