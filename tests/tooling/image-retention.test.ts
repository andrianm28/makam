import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
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
const retentionScript = fileURLToPath(new URL("../../scripts/images/expired-versions.ts", import.meta.url));
const retention = readFileSync(new URL("../../.github/workflows/image-retention.yml", import.meta.url), "utf8");

/**
 * The one file the sweep does not judge: the guard's own test, whose fixtures
 * are the commands it refuses to accept. It is the only file that has to spell
 * them out, so it is named here — as a list of one, and the test below proves
 * both that the rule *does* flag it and that the list has not grown.
 */
const EXEMPT = ["tests/support/global-prune.test.ts"];

/** Every file git knows, whether or not it is added to this commit yet. */
function trackedFiles(): ScannableFile[] {
  const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  return listed
    .split("\n")
    .filter(Boolean)
    .map((file) => ({ path: file, text: readIfText(file) }));
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
      .filter((file) => !EXEMPT.includes(file.path))
      .flatMap(globalPrunes);
    expect(found).toEqual([]);
  });

  it("would flag the one exempt file, so nothing hides in it silently", () => {
    // The fixtures are the commands. The rule catches them; only the sweep
    // skips the file, and it does that by name. If this ever comes back empty
    // the exemption is hiding a file for no reason and can go.
    const fixtures = trackedFiles().find((file) => file.path === EXEMPT[0]);
    expect(fixtures, "the exempt file is gone; drop the exemption").toBeDefined();
    expect(globalPrunes(fixtures as ScannableFile).length).toBeGreaterThan(0);
  });

  it("exempts one path and one only, and it is a path that exists", () => {
    const tracked = new Set(trackedFiles().map((file) => file.path));
    expect(EXEMPT.length).toBe(1);
    for (const path of EXEMPT) {
      expect(tracked.has(path), `${path} does not exist, so nothing is exempt`).toBe(true);
    }
  });

  it("are checked in the places a prune would actually be run from", () => {
    // The sweep is only worth anything if it can see these. The first version
    // of it could not see the first four: three extension-less executables and
    // a Dockerfile.
    const files = trackedFiles();
    for (const path of [
      "deploy/bin/makam-prune-images",
      "deploy/bin/makam-deploy",
      "deploy/bin/makam-diskcheck",
      // Mode 100644 in git, installed 0755 on the host: invisible to a rule that
      // looked at the executable bit.
      "deploy/bin/makam-deploy-status",
      "deploy/bin/makam-backup-lib",
      "Dockerfile",
      "deploy/systemd/makam-staging-health.service",
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
    expect(retention).toMatch(/set -euo pipefail[\s\S]*expired-versions\.ts/);
  });

  it("guards every step that pipes gh or the script, so a failed read cannot look like an empty one", () => {
    // The re-review found the read step piping `gh api | jq` with no pipefail
    // and no `defaults:`, so a failed `gh api` left a truncated file and a green
    // step: the deployments looked empty, the keep list lost the digest that is
    // running, and deletion went ahead on age alone. Every step that pipes says
    // so itself, whatever the shell default happens to be.
    expect(retention).toMatch(/defaults:\s*\n\s+run:\s*\n\s+shell: bash/);
    const piped = retention
      .split(/\n {6}- (?:name|run|uses):/)
      .slice(1)
      .filter((step) => /run: \|/.test(step) && /\|\s*(jq|tee)\b/.test(step));
    expect(piped.length).toBeGreaterThan(0);
    for (const step of piped) {
      expect(step, "a step pipes without set -euo pipefail").toContain("set -euo pipefail");
    }
  });

  it("names nothing when the deployments file a failed read left is truncated", () => {
    // The artefact the missing pipefail produced: a half-written JSON file.
    const dir = mkdtempSync(path.join(tmpdir(), "makam-retention-"));
    const versionsFile = path.join(dir, "versions.json");
    const deploymentsFile = path.join(dir, "deployments.json");
    writeFileSync(
      versionsFile,
      JSON.stringify([
        { name: `sha256:${"a".repeat(64)}`, created_at: "2020-01-01T00:00:00Z", metadata: { container: { tags: [`sha-${"a".repeat(40)}`] } } },
      ]),
    );
    writeFileSync(deploymentsFile, '[{"state":"success","environ');
    const result = spawnSync("npx", ["--no-install", "tsx", retentionScript, versionsFile, deploymentsFile], { encoding: "utf8" });
    expect(result.stdout.trim()).toBe("");
    expect(result.status).toBe(78);
  });

  it("may be started by hand, and can be asked to only report", () => {
    expect(retention).toContain("workflow_dispatch");
    expect(retention).toContain("dry_run");
  });
});
