import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The host's root filesystem is shared with other projects, and a full disk
// takes down staging, production and every builder agent at once. The check runs
// on the health timer that already exists, so the fake `df` below is the whole
// world it sees: a warning has to come out of the number df reports, and a
// number that cannot be read has to be treated as no space at all.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const diskcheckScript = path.join(repo, "deploy/bin/makam-diskcheck");

/** What a host reports: one `df` line per filesystem. */
const dfLine = (use: number, mount = "/"): string =>
  `Filesystem     1K-blocks      Used Available Use% Mounted on\n` +
  `/dev/root       104857600  ${100_000_000 - Math.round((100_000_000 * use) / 100)}  ${Math.round((100_000_000 * use) / 100)}  ${use}% ${mount}`;

/** A bin directory with a fake `df` answering a canned report, and a fake logger. */
function host(report: string) {
  const root = mkdtempSync(path.join(tmpdir(), "makam-disk-"));
  const bin = path.join(root, "bin");
  mkdirSync(bin, { recursive: true });
  writeFileSync(
    path.join(bin, "df"),
    [
      "#!/usr/bin/env bash",
      'echo "df $*" >> "$FAKE_DF_LOG"',
      "cat <<'EOF'",
      report,
      "EOF",
      "exit ${FAKE_DF_EXIT:-0}",
      "",
    ].join("\n"),
  );
  writeFileSync(
    path.join(bin, "logger"),
    ["#!/usr/bin/env bash", 'echo "logger $*" >> "$FAKE_LOGGER_LOG"', "exit 0", ""].join("\n"),
  );
  chmodSync(path.join(bin, "df"), 0o755);
  chmodSync(path.join(bin, "logger"), 0o755);
  return { root, bin };
}

function check(world: ReturnType<typeof host>, args: string[] = [], extra: Record<string, string> = {}) {
  const journal = path.join(world.root, "journal.log");
  const dfLog = path.join(world.root, "df.log");
  writeFileSync(journal, "");
  writeFileSync(dfLog, "");
  const env: NodeJS.ProcessEnv = {
    PATH: `${world.bin}:/usr/bin:/bin`,
    NODE_ENV: "test",
    FAKE_LOGGER_LOG: journal,
    FAKE_DF_LOG: dfLog,
    ...extra,
  };
  const result = spawnSync("bash", [diskcheckScript, ...args], { encoding: "utf8", env });
  return {
    code: result.status,
    output: `${result.stdout}${result.stderr}`,
    journal: readJournal(journal),
    asked: readJournal(dfLog),
  };
}

function readJournal(file: string): string {
  try {
    return readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

describe("makam-diskcheck", () => {
  it("says nothing while the root disk has room", () => {
    const world = host(dfLine(84));
    const result = check(world);
    expect(result.code).toBe(0);
    expect(result.journal).toBe("");
  });

  it("warns in the journal when the root disk passes 85%, and marks the unit failed", () => {
    const world = host(dfLine(86));
    const result = check(world);
    expect(result.code).toBe(1);
    // The same shape makam-healthcheck uses, so one `journalctl` finds both.
    expect(result.journal).toContain("makam-disk");
    expect(result.journal).toMatch(/86/);
    expect(result.journal).toMatch(/user\.err/);
  });

  it("warns at exactly 85%, because that is the number in the runbook", () => {
    const world = host(dfLine(85));
    expect(check(world).code).toBe(1);
  });

  it("warns when df cannot be read, rather than reading that as room", () => {
    const failed = host("no report at all");
    const errored = host(dfLine(10));
    for (const world of [failed, errored]) {
      const result = check(world, [], { FAKE_DF_EXIT: "1" });
      expect(result.code).toBe(1);
      expect(result.journal).toMatch(/makam-disk/);
    }
    // A report with no line for the filesystem asked about is the same case.
    const silent = check(host(""));
    expect(silent.code).toBe(1);
    expect(silent.journal).toMatch(/makam-disk/);
  });

  it("watches the filesystem it is given, which is not always the root one", () => {
    const world = host(dfLine(91, "/opt/makam-v1"));
    const result = check(world, ["/opt/makam-v1"]);
    expect(result.code).toBe(1);
    expect(result.asked).toContain("df -P -h /opt/makam-v1");
    expect(result.journal).toContain("/opt/makam-v1");
  });

  it("asks about the root filesystem when it is given no path", () => {
    const world = host(dfLine(20));
    expect(check(world).asked).toContain("df -P -h /");
  });

  it("takes the threshold from the environment, defaulting to 85", () => {
    const world = host(dfLine(86));
    expect(check(world, [], { MAKAM_DISK_WARN_PERCENT: "95" }).code).toBe(0);
    expect(check(world, [], { MAKAM_DISK_WARN_PERCENT: "80" }).code).toBe(1);
  });

  it("refuses a threshold that is not a number", () => {
    const world = host(dfLine(10));
    const result = check(world, [], { MAKAM_DISK_WARN_PERCENT: "eighty" });
    expect(result.code).toBe(64);
    expect(result.journal).toBe("");
  });
});
