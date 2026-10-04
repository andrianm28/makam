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

  it("a non-2xx from GitHub exits 0 and leaves one line, not curl's error", () => {
    const t = setup('echo "curl: (22) The requested URL returned error: 422" >&2; exit 22');
    expect(t.run("begin", "--digest", DIGEST, "--tag", "sha-abc").status).toBe(0);
    const lines = t.log().trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("could not create the GitHub deployment");
    const r = t.run("state", "--state", "success", "--description", "x");
    expect(r.status).toBe(0);
    expect(r.stderr).toBe("");
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

// GitHub refuses a status (and a Deployment) whose description is over 140 characters,
// and a refused POST leaves the deploy's outcome unrecorded: the first production
// rehearsal lost a failure that way. promote.yml reads the success status by its
// ending, `(<digest>) healthy`, so a cut must never take that off.
describe("makam-deploy-status: GitHub's 140-character limit on a description", () => {
  const TAG = `sha-${"c".repeat(40)}`;
  const PREVIOUS = `sha-${"d".repeat(40)}`;
  /** The JSON bodies the fake curl was sent, in order. */
  const bodies = (t: ReturnType<typeof setup>): { description: string; state?: string }[] =>
    t
      .sent()
      .split("\n")
      .filter((line) => line.startsWith("{"))
      .map((line) => JSON.parse(line));
  /** The description of the last body: a status after a begin, or the Deployment's own after a begin alone. */
  const lastDescription = (t: ReturnType<typeof setup>): string => bodies(t).at(-1)!.description;
  const failWith = (description: string) => {
    const t = setup(okCurl);
    t.run("begin", "--digest", DIGEST, "--tag", TAG);
    expect(t.run("state", "--state", "failure", "--description", description).status).toBe(0);
    return t;
  };

  it("sends a description of 140 characters, the longest GitHub takes, as it is", () => {
    const description = "x".repeat(140);
    expect(lastDescription(failWith(description))).toBe(description);
  });

  it("cuts a failure of 141 characters to 140", () => {
    const description = `${"a".repeat(70)}${"b".repeat(71)}`;
    const sent = lastDescription(failWith(description));
    expect(sent).toHaveLength(140);
    expect(description.length).toBe(141);
  });

  it("cuts the failure of a deploy that never became healthy (about 200 characters) to 140, keeping how it starts and how it ends", () => {
    const description = `${TAG} (${DIGEST}) never became healthy; rolling back to ${PREVIOUS}`;
    expect(description.length).toBeGreaterThan(190);
    const t = failWith(description);
    const sent = lastDescription(t);
    expect(sent).toHaveLength(140);
    expect(sent.startsWith(TAG)).toBe(true);
    expect(sent.endsWith(`rolling back to ${PREVIOUS}`)).toBe(true);
    expect(sent).toContain("...");
    expect(t.log()).toContain(`(${sent})`);
    expect(t.log()).not.toContain("could not record status");
  });

  it("sends the success description makam-deploy writes, `<tag> (<digest>) healthy`, unchanged", () => {
    const description = `${TAG} (${DIGEST}) healthy`;
    expect(description.length).toBeLessThanOrEqual(140);
    const t = setup(okCurl);
    t.run("begin", "--digest", DIGEST, "--tag", TAG);
    expect(t.run("state", "--state", "success", "--description", description).status).toBe(0);
    expect(lastDescription(t)).toBe(description);
  });

  it("keeps a success description that is too long ending in (<digest>) healthy, the words promote.yml reads", () => {
    const description = `sha-${"e".repeat(100)} (${DIGEST}) healthy`;
    expect(description.length).toBeGreaterThan(140);
    const t = setup(okCurl);
    t.run("begin", "--digest", DIGEST, "--tag", TAG);
    expect(t.run("state", "--state", "success", "--description", description).status).toBe(0);
    const sent = lastDescription(t);
    expect(sent).toHaveLength(140);
    expect(sent.endsWith(`(${DIGEST}) healthy`)).toBe(true);
    expect(sent.startsWith("sha-eeee")).toBe(true);
  });

  it("cuts the default description of a state too, as it cuts the one it is given", () => {
    const longTag = `sha-${"f".repeat(200)}`;
    const t = setup(okCurl);
    t.run("begin", "--digest", DIGEST, "--tag", longTag);
    expect(t.run("state", "--state", "failure", "--tag", longTag).status).toBe(0);
    expect(lastDescription(t).length).toBeLessThanOrEqual(140);
    expect(t.run("state", "--state", "success", "--tag", longTag).status).toBe(0);
    const sent = lastDescription(t);
    expect(sent.length).toBeLessThanOrEqual(140);
    expect(sent.endsWith("deployed and healthy")).toBe(true);
  });

  it("counts characters, as GitHub does, and not bytes", () => {
    const description = "é".repeat(150);
    const sent = lastDescription(failWith(description));
    expect([...sent]).toHaveLength(140);
    // 140 two-byte characters is still a description GitHub takes.
    const fits = "é".repeat(140);
    expect(lastDescription(failWith(fits))).toBe(fits);
  });

  it("cuts the Deployment's own description when begin is given a long one", () => {
    const t = setup(okCurl);
    expect(t.run("begin", "--digest", DIGEST, "--tag", TAG, "--description", `Deploy ${TAG} to makam-prod ${"z".repeat(150)}`).status).toBe(0);
    expect(bodies(t)[0].description.length).toBeLessThanOrEqual(140);
    expect(t.sent()).toContain("/deployments ");
  });
});
