import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// makam-restore-test restores a Dump into a throwaway Postgres container. The
// Postgres image declares VOLUME /var/lib/postgresql, so Docker gives that
// container an anonymous volume holding the restored database, and `docker rm`
// without -v leaves it behind: a full copy of what was in the Dump, kept for
// ever on the host, where the Dump itself is kept for 7 days. With ticket 108
// the check runs every Monday against makam-prod, so the container has to go
// together with its volume. A fake docker records what it was asked, so this
// holds on a machine with no Docker and never touches one.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const script = path.join(repo, "deploy/bin/makam-restore-test");
const dirs: string[] = [];

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

/** A host with one Dump that cannot be restored, so the check always ends through its cleanup. */
function host() {
  const base = mkdtempSync(path.join(tmpdir(), "makam-restore-volume-"));
  dirs.push(base);
  const root = path.join(base, "opt-makam-v1");
  const fakebin = path.join(base, "fakebin");
  const log = path.join(base, "docker.log");
  const backups = path.join(root, "prod/backups/db");
  mkdirSync(fakebin);
  mkdirSync(backups, { recursive: true });
  writeFileSync(path.join(root, "prod/backup-passphrase"), "a passphrase of one line\n");
  chmodSync(path.join(root, "prod/backup-passphrase"), 0o600);
  // Neither file is encrypted, so openssl refuses the Dump once the container is up.
  writeFileSync(path.join(backups, "makam-20261004T000000Z.dump.enc"), "not an encrypted Dump");
  writeFileSync(path.join(backups, "makam-20261004T000000Z.counts.enc"), "not encrypted counts");
  writeFileSync(
    path.join(fakebin, "docker"),
    [
      "#!/usr/bin/env bash",
      `echo "$*" >> "${log}"`,
      'case "$1" in',
      "  info) echo /var/lib/docker ;;",
      '  exec) case "$*" in *pg_restore*) cat > /dev/null ;; esac ;;',
      "esac",
      "exit 0",
      "",
    ].join("\n"),
  );
  writeFileSync(path.join(fakebin, "logger"), "#!/usr/bin/env bash\nexit 0\n");
  chmodSync(path.join(fakebin, "docker"), 0o755);
  chmodSync(path.join(fakebin, "logger"), 0o755);
  return {
    check: (...args: string[]) =>
      spawnSync("bash", [script, "--env", "prod", ...args], {
        encoding: "utf8",
        env: { ...process.env, MAKAM_ROOT: root, MAKAM_BACKUP_FREE_BYTES: "1000000000000", PATH: `${fakebin}:${process.env.PATH}` },
      }),
    docker: (): string[] => (existsSync(log) ? readFileSync(log, "utf8").split("\n").filter(Boolean) : []),
  };
}

/** The container name `docker run` was given. */
function started(calls: string[]): string {
  const run = calls.find((call) => call.startsWith("run "));
  expect(run, "the check never started a container").toBeDefined();
  const name = /--name (\S+)/.exec(run as string)?.[1];
  expect(name, `no --name in: ${run}`).toBeDefined();
  return name as string;
}

/** Whether a `docker rm` line asks for the container's anonymous volumes to go too (-v, -fv, -vf or --volumes). */
function removesVolumes(rm: string): boolean {
  return rm
    .split(" ")
    .filter((word) => word.startsWith("-"))
    .some((flag) => flag === "--volumes" || (!flag.startsWith("--") && flag.includes("v")));
}

describe("makam-restore-test --env prod", () => {
  it("removes its throwaway Postgres together with the anonymous volume the restored Dump landed in, when the restore fails", () => {
    const h = host();
    const result = h.check();
    expect(result.status, result.stderr).toBe(1);
    expect(result.stderr).toContain("ERROR restoring");

    const calls = h.docker();
    const name = started(calls);
    const removals = calls.filter((call) => call.startsWith("rm "));
    expect(removals, "the container was never removed").toHaveLength(1);
    expect(removals[0].split(" ").at(-1)).toBe(name);
    expect(removesVolumes(removals[0]), `docker ${removals[0]} leaves the restored database in an anonymous volume`).toBe(true);
  });

  it("does not remove the container when asked to keep it, and says how to remove it with its volume", () => {
    const h = host();
    const result = h.check("--keep");
    expect(result.status, result.stderr).toBe(1);

    const calls = h.docker();
    const name = started(calls);
    expect(calls.filter((call) => call.startsWith("rm "))).toEqual([]);
    const hint = result.stderr.split("\n").find((line) => line.startsWith(`left ${name} in place`));
    expect(hint, result.stderr).toBeDefined();
    const command = /\((docker rm [^)]*?) when done\)/.exec(hint as string)?.[1];
    expect(command, hint).toBeDefined();
    expect(removesVolumes(command as string), `"${command}" would leave the volume behind`).toBe(true);
  });
});
