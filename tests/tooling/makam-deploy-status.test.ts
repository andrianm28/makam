import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

// makam-deploy reports each step of a deploy to GitHub as a Deployment status
// through makam-deploy-status. A fake curl records what would be sent, so a
// bad-usage call fails here and not on the host, where promote.yml would refuse
// staging for having no successful status.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const statusScript = path.join(repo, "deploy/bin/makam-deploy-status");
const deployScript = path.join(repo, "deploy/bin/makam-deploy");
const DIGEST = `sha256:${"c".repeat(64)}`;
const dirs: string[] = [];

function setup(curlBody: string) {
  const root = mkdtempSync(path.join(tmpdir(), "makam-status-"));
  dirs.push(root);
  mkdirSync(path.join(root, "staging"));
  mkdirSync(path.join(root, "bin"));
  mkdirSync(path.join(root, "fakebin"));
  writeFileSync(path.join(root, "staging/staging.env"), "MAKAM_GITHUB_TOKEN=ghp_fake\n");
  const calls = path.join(root, "calls.log");
  writeFileSync(path.join(root, "fakebin/curl"), `#!/usr/bin/env bash\n{ echo "$*"; cat; echo; } >> "${calls}"\n${curlBody}\n`);
  chmodSync(path.join(root, "fakebin/curl"), 0o755);
  const run = (...args: string[]) =>
    spawnSync(statusScript, ["--env", "staging", ...args], {
      encoding: "utf8",
      env: { ...process.env, MAKAM_ROOT: root, PATH: `${root}/fakebin:${process.env.PATH}` },
    });
  const log = () => readFileSync(path.join(root, "staging/deploy.log"), "utf8");
  const sent = () => (existsSync(calls) ? readFileSync(calls, "utf8") : "");
  return { root, run, log, sent };
}
const okCurl = `if echo "$*" | grep -q '/statuses'; then echo '{"id":1}'; else echo '{"id":4242}'; fi`;

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

describe("makam-deploy-status: a Deployment and its states", () => {
  it("begin creates the Deployment and state success lands on it with its description", () => {
    const t = setup(okCurl);
    expect(t.run("begin", "--digest", DIGEST, "--tag", "sha-abc", "--description", "Deploy sha-abc").status).toBe(0);
    const r = t.run("state", "--state", "success", "--description", "sha-abc healthy");
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
    expect(t.sent()).toContain("/deployments/4242/statuses");
    expect(t.sent()).toContain('"state":"success"');
    expect(t.sent()).toContain('"description":"sha-abc healthy"');
  });

  it.each(["in_progress", "failure"])("state %s is accepted and recorded", (state) => {
    const t = setup(okCurl);
    t.run("begin", "--digest", DIGEST, "--tag", "sha-abc");
    expect(t.run("state", "--state", state, "--description", "why").status).toBe(0);
    expect(t.sent()).toContain(`"state":"${state}"`);
    expect(t.log()).not.toMatch(/unknown argument|usage/i);
  });

  it("the old positional form is a bad usage", () => {
    const t = setup(okCurl);
    expect(t.run("state", "success", "healthy").status).toBe(64);
  });

  it("a non-2xx from GitHub exits 0 and leaves one log line", () => {
    const t = setup("exit 22");
    t.run("begin", "--digest", DIGEST, "--tag", "sha-abc");
    expect(t.run("state", "--state", "success", "--description", "x").status).toBe(0);
    expect(t.log()).not.toMatch(/usage/i);
  });

  it("without a token every call is a logged no-op", () => {
    const t = setup(okCurl);
    writeFileSync(path.join(t.root, "staging/staging.env"), "X=1\n");
    expect(t.run("state", "--state", "success").status).toBe(0);
    expect(t.log()).toContain("no MAKAM_GITHUB_TOKEN");
  });

  it("a failed begin does not leave the last run's Deployment to receive this run's states", () => {
    const t = setup(okCurl);
    t.run("begin", "--digest", DIGEST, "--tag", "sha-abc");
    writeFileSync(path.join(t.root, "fakebin/curl"), "#!/usr/bin/env bash\nexit 22\n");
    t.run("begin", "--digest", DIGEST, "--tag", "sha-def");
    const before = t.sent();
    t.run("state", "--state", "failure", "--description", "x");
    expect(t.sent()).toBe(before);
  });
});

describe("makam-deploy: every state call is in the form makam-deploy-status accepts", () => {
  it("each `status state` call passes --state and --description", () => {
    const calls = readFileSync(deployScript, "utf8").split("\n").filter((l) => /^\s*status state/.test(l));
    expect(calls.length).toBeGreaterThanOrEqual(5);
    for (const line of calls) expect(line).toMatch(/^\s*status state --state (in_progress|success|failure) --description "/);
  });

  it("the unsigned refusal runs before begin and records no state", () => {
    const text = readFileSync(deployScript, "utf8");
    expect(text).not.toMatch(/status state[^\n]*unsigned/);
  });
});
