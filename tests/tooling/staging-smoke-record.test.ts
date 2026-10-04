import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

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

function record(result: string, releaseOk = "true") {
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
      RELEASE_OK: releaseOk,
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

describe("staging smoke: the release staging runs must be the one the Deployment names", () => {
  it("a passing smoke run on the named release records success", () => {
    expect(record("success", "true").post).toContain("state=success");
  });

  it.each(["false", ""])("a passing smoke run is recorded as failure when the release check says %j", (releaseOk) => {
    const { status, post } = record("success", releaseOk);
    expect(status).toBe(0);
    expect(post).toContain("state=failure");
    expect(post).toContain(`description=smoke test against dev.makam.co.id for ${DIGEST}: failure`);
  });
});

type Step = { name?: string; run?: string; if?: string };
const workflow = parse(text) as {
  on: Record<string, unknown>;
  jobs: { smoke: { if?: string; steps: Step[] } };
};
const releaseStep = workflow.jobs.smoke.steps.find((s) => s.name === "Staging runs the release the Deployment names");

function releaseCheck(healthBody: string | null, ref = "abc1234") {
  const root = mkdtempSync(path.join(tmpdir(), "makam-release-"));
  dirs.push(root);
  mkdirSync(path.join(root, "bin"));
  const out = path.join(root, "output");
  writeFileSync(out, "");
  writeFileSync(
    path.join(root, "bin/curl"),
    healthBody === null ? "#!/usr/bin/env bash\nexit 7\n" : `#!/usr/bin/env bash\ncat <<'JSON'\n${healthBody}\nJSON\n`,
  );
  chmodSync(path.join(root, "bin/curl"), 0o755);
  const r = spawnSync("bash", ["-eo", "pipefail", "-c", releaseStep?.run ?? "exit 99"], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, BASE_URL: "https://dev.makam.co.id", REF: ref, GITHUB_OUTPUT: out },
  });
  return { status: r.status, output: readFileSync(out, "utf8"), stderr: r.stderr };
}

describe("staging smoke: the release check step", () => {
  it("passes when /api/health reports the release the Deployment names, even when health is 503", () => {
    const r = releaseCheck('{"ok":false,"release":"abc1234","rilisTerbuka":3}');
    expect(r.status).toBe(0);
    expect(r.output).toContain("release_ok=true");
  });

  it("fails the release when staging runs a different release", () => {
    const r = releaseCheck('{"ok":true,"release":"fff9999"}');
    expect(r.status).toBe(0);
    expect(r.output).toContain("release_ok=false");
    expect(r.stderr).toContain("fff9999");
    expect(r.stderr).toContain("abc1234");
  });

  it.each([['{"ok":true}'], ['{"ok":true,"release":null}'], ["not json"]])("fails the release when health names none (%s)", (body) => {
    expect(releaseCheck(body).output).toContain("release_ok=false");
  });

  it("fails the release when health cannot be reached", () => {
    expect(releaseCheck(null).output).toContain("release_ok=false");
  });
});

describe("staging smoke: when it runs", () => {
  it("also runs when a deployment_status arrives, besides by hand and on the schedule", () => {
    expect(Object.keys(workflow.on)).toEqual(expect.arrayContaining(["workflow_dispatch", "schedule", "deployment_status"]));
  });

  it("a deployment_status only starts the job for a successful staging deployment", () => {
    const cond = workflow.jobs.smoke.if ?? "";
    expect(cond).toContain("github.event_name != 'deployment_status'");
    expect(cond).toContain("github.event.deployment_status.state == 'success'");
    expect(cond).toContain("github.event.deployment.environment == 'staging'");
  });
});
