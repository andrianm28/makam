import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { globalPrunes, type ScannableFile } from "../support/global-prune";

// The host this repository deploys to is shared with other projects, so nothing
// in here may ever clean Docker up globally: a prune without a name reaches the
// images, volumes and networks that belong to somebody else. Retention is by
// name and by label only (deploy/bin/makam-prune-images, scripts/clean.mts).
//
// The sweep runs over what git knows, not over a directory walk with a suffix
// filter: the Standards review found the first version of it skipped every
// extension-less executable in deploy/bin, which is where the prune itself
// lives, so a `docker image prune -a` written into makam-prune-images would
// have passed. What counts as scannable is globalPrunes' rule, and the claim in
// AGENTS.md and the runbook is written to match it exactly.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const retention = readFileSync(new URL("../../.github/workflows/image-retention.yml", import.meta.url), "utf8");

/**
 * The one file that has to contain these commands: the guard's own test, whose
 * fixtures are the commands it refuses. Named by path rather than skipped by a
 * pattern, and asserted below to be the only exemption, so it cannot grow into
 * a hiding place.
 */
const FIXTURES = "tests/support/global-prune.test.ts";

/**
 * Every file git knows, with its mode. Tracked files take git's mode (`100755`
 * for an executable); a file not added yet takes the mode on disk, so a new
 * script is scanned before it is committed.
 */
function trackedFiles(): ScannableFile[] {
  const git = (args: string[]): string =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  const modes = new Map(
    git(["ls-files", "-s", "--cached"])
      .split("\n")
      .map((line) => line.split("\t")[0]?.split(/\s+/))
      .filter((parts): parts is [string, string, string] => parts?.length === 3)
      .map(([mode, , file]) => [file, mode] as const),
  );
  return git(["ls-files", "--cached", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean)
    .map((file) => ({
      path: file,
      mode: modes.get(file) ?? (executableOnDisk(file) ? "100755" : "100644"),
      text: readIfText(file),
    }));
}

function executableOnDisk(file: string): boolean {
  try {
    return (statSync(new URL(`../../${file}`, import.meta.url)).mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

/** The file's text, or "" when it is not text at all (a PNG, a binary lockfile). */
function readIfText(file: string): string {
  try {
    const bytes = readFileSync(new URL(`../../${file}`, import.meta.url));
    return bytes.includes(0) ? "" : bytes.toString("utf8");
  } catch {
    return "";
  }
}

describe("the shared host's Docker objects", () => {
  it("are never cleaned up by a prune that has no name", () => {
    const found = trackedFiles()
      .filter((file) => file.path !== FIXTURES)
      .flatMap(globalPrunes);
    expect(found).toEqual([]);
  });

  it("exempt exactly one file from that rule: the guard's own fixtures", () => {
    // The fixtures have to spell the commands out, so they are named, and this
    // says the exemption is one path and not a pattern that grows.
    expect(FIXTURES).toBe("tests/support/global-prune.test.ts");
    expect(trackedFiles().some((file) => file.path === FIXTURES)).toBe(true);
  });

  it("are checked in the places a prune would actually be run from", () => {
    // The sweep is only worth anything if it can see these; the first version
    // of it could not see the first one.
    const files = trackedFiles();
    for (const path of [
      "deploy/bin/makam-prune-images",
      "deploy/bin/makam-deploy",
      "deploy/bin/makam-diskcheck",
      "scripts/clean.mts",
      "scripts/stack.mts",
      "docker-compose.yml",
      "package.json",
      ".github/workflows/ci.yml",
      ".github/workflows/image-retention.yml",
    ]) {
      const found = files.find((file) => file.path === path);
      expect(found, `${path} is not in the sweep at all`).toBeDefined();
      expect(found?.text.length, `${path} is not read as text`).toBeGreaterThan(0);
    }
    // And something outside the three directories the first version walked.
    expect(files.some((file) => file.path.startsWith("e2e/"))).toBe(true);
    expect(files.some((file) => file.path.startsWith("src/"))).toBe(true);
  });
});

describe("the monthly image retention run", () => {
  it("runs once a month", () => {
    expect(retention).toMatch(/cron:\s*"[\d*\/ ]+ [\d*\/]+ 1 \* \*"/);
  });

  it("asks which versions have expired, so the deletion is the tested one", () => {
    expect(retention).toContain("scripts/images/expired-versions.ts");
  });

  it("deletes version by version, never a tag or a wildcard", () => {
    expect(retention).toMatch(/gh api --method DELETE "[^"]*versions\/\$\{?[A-Za-z_]+\}?"/);
  });

  it("reads every page of both lists, since GitHub truncates them", () => {
    expect(retention).toMatch(/gh api --paginate "[^"]*versions\?per_page=100"/);
    expect(retention).toMatch(/gh api --paginate "[^"]*deployments\?per_page=100"/);
  });

  it("keeps the script's own answer instead of tee's when it refuses", () => {
    // The script exits 78 when nothing proved undeployed, which has to fail the
    // step; a pipeline's status is its last command's, which would be tee's.
    expect(retention).toMatch(/set -o pipefail[\s\S]*expired-versions\.ts/);
  });

  it("may be started by hand, and can be asked to only report", () => {
    expect(retention).toContain("workflow_dispatch");
    expect(retention).toContain("dry_run");
  });
});
