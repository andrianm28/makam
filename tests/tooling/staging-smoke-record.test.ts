import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// The smoke workflow records its result as a Deployment status that
// promote.yml reads before it promotes a digest. The step's shell runs here
// against a fake gh, so a pass or a failure that posts an empty or unknown
// state fails in this test and not on GitHub with a 422.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const DIGEST = `sha256:${"d".repeat(64)}`;
const dirs: string[] = [];

// The workflow is read as text (no YAML dependency): the step's `run: |` block,
// de-indented, is the script GitHub would run.
const text = readFileSync(path.join(repo, ".github/workflows/staging-smoke.yml"), "utf8");
const block = text.split("- name: Record the result against the digest")[1]?.split("\n      - ")[0] ?? "";
const body = block.split(/\n\s+run: \|\n/)[1] ?? "";
const script = body.replace(/^ {10}/gm, "");

function record(result: string) {
  const root = mkdtempSync(path.join(tmpdir(), "makam-smoke-"));
  dirs.push(root);
  mkdirSync(path.join(root, "bin"));
  const calls = path.join(root, "calls.log");
  writeFileSync(
    path.join(root, "bin/gh"),
    `#!/usr/bin/env bash\necho "$*" >> "${calls}"\ncase "$*" in *--jq*) echo 4242;; esac\n`,
  );
  chmodSync(path.join(root, "bin/gh"), 0o755);
  const r = spawnSync("bash", ["-eo", "pipefail", "-c", script], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      RUNNER_TEMP: root,
      GITHUB_REPOSITORY: "o/r",
      GITHUB_SERVER_URL: "https://github.com",
      GITHUB_RUN_ID: "1",
      GITHUB_SHA: "abc",
      DIGEST,
      RESULT: result,
    },
  });
  const lines = readFileSync(calls, "utf8").trim().split("\n");
  return { status: r.status, post: lines.find((l) => l.includes("/statuses")) ?? "" };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("staging smoke: the result recorded against the digest", () => {
  it("the step script is found", () => {
    expect(script).toContain("gh api");
  });

  it("a passing smoke run records success with the description Promosikan ke produksi looks for", () => {
    const { status, post } = record("success");
    expect(status).toBe(0);
    expect(post).toContain("deployments/4242/statuses");
    expect(post).toContain("state=success");
    expect(post).toContain(`description=smoke test against dev.makam.co.id for ${DIGEST}: success`);
  });

  it.each(["failure", "cancelled"])("a %s smoke run records failure with the same description shape", (result) => {
    const { status, post } = record(result);
    expect(status).toBe(0);
    expect(post).toContain("state=failure");
    expect(post).toContain(`description=smoke test against dev.makam.co.id for ${DIGEST}: failure`);
  });
});
