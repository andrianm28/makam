import { afterEach, describe, expect, it } from "vitest";
import { cleanSandboxes, fakeGh, readWorkflow, runStep, type RunResult } from "../support/workflow";

// The smoke workflow records its result as a Deployment status that
// promote.yml reads before it promotes a digest. The step's shell runs here
// against a fake gh (and a fake curl for /api/health), so a pass or a failure
// that posts an empty or unknown state fails in this test and not on GitHub
// with a 422, and a pass for a digest the site is not running cannot be recorded.
const DIGEST = `sha256:${"d".repeat(64)}`;
const REF = "1".repeat(40);
const PREVIOUS_REF = "2".repeat(40);
const smoke = readWorkflow("staging-smoke.yml");
const RECORD_STEP = "Record the result against the digest";

afterEach(cleanSandboxes);

/** What `curl https://dev.makam.co.id/api/health` prints; `unreachable` is a curl that fails. */
type Health = { release?: string | null } | "unreachable" | "not json";

function record(result: string, health: Health = { release: REF }): RunResult {
  const body =
    health === "unreachable"
      ? 'echo "curl: (7) Failed to connect" >&2; exit 7'
      : health === "not json"
        ? 'echo "<html>Bad Gateway</html>"'
        : `echo '${JSON.stringify({ ok: true, environment: "staging", rilisTerbuka: 3, ...(health.release === undefined ? {} : { release: health.release }) })}'`;
  return runStep(smoke, "smoke", RECORD_STEP, {
    context: {
      "secrets.GITHUB_TOKEN": "token",
      "github.repository": "o/r",
      "steps.running.outputs.id": "4242",
      "steps.running.outputs.digest": DIGEST,
      "steps.running.outputs.ref": REF,
      "job.status": result,
    },
    bins: { gh: fakeGh, curl: body },
  });
}

const posted = (r: RunResult) => r.calls.find((call) => call.includes("/statuses")) ?? "";

describe("staging smoke: the result recorded against the digest", () => {
  it("the step script is found", () => {
    expect(smoke.step("smoke", RECORD_STEP).run).toContain("gh api");
  });

  it("a passing smoke run on the commit the deployment was made for records success with the description Promosikan ke produksi looks for", () => {
    const r = record("success");
    expect(r.status).toBe(0);
    const post = posted(r);
    expect(post).toContain("deployments/4242/statuses");
    expect(post).toContain("state=success");
    expect(post).toContain(`description=smoke test against dev.makam.co.id for ${DIGEST}: success`);
    expect(r.calls.some((call) => call.startsWith("curl") && call.includes("/api/health"))).toBe(true);
  });

  it.each(["failure", "cancelled"])("a %s smoke run records failure with the same description shape, whatever the site reports", (result) => {
    const r = record(result);
    expect(r.status).toBe(0);
    expect(posted(r)).toContain("state=failure");
    expect(posted(r)).toContain(`description=smoke test against dev.makam.co.id for ${DIGEST}: failure`);
  });
});

describe("staging smoke: a pass belongs to the digest that is actually running", () => {
  it("records failure when /api/health reports a release different from the Deployment's ref (the deploy rolled back)", () => {
    const r = record("success", { release: PREVIOUS_REF });
    expect(r.status).toBe(0);
    expect(posted(r)).toContain("state=failure");
    expect(posted(r)).toContain(`description=smoke test against dev.makam.co.id for ${DIGEST}: failure`);
    expect(r.stderr).toContain(PREVIOUS_REF);
    expect(r.stderr).toContain(REF);
  });

  it.each([
    ["names no release (an image from before /api/health reported one)", { release: undefined }],
    ["names a null release", { release: null }],
    ["cannot be reached", "unreachable" as const],
    ["does not answer JSON", "not json" as const],
  ])("records failure when /api/health %s, because a site that cannot say what it runs is not the digest we know", (_what, health) => {
    const r = record("success", health);
    expect(r.status).toBe(0);
    expect(posted(r)).toContain("state=failure");
  });

  it("asks nothing of the site when the smoke test itself failed", () => {
    expect(record("failure").calls.some((call) => call.startsWith("curl"))).toBe(false);
  });

  it("reads the health body whatever the status code: an unhealthy site answers 503 with the same JSON", () => {
    expect(smoke.step("smoke", RECORD_STEP).run).not.toMatch(/curl[^\n|]*( -f|--fail)/);
  });

  it.each([
    ["success", { release: REF }],
    ["success", { release: PREVIOUS_REF }],
    ["failure", { release: REF }],
  ])("keeps the status description within GitHub's 140 characters (%s, %o)", (result, health) => {
    const description = /description=(.*)$/.exec(posted(record(result, health)))?.[1] ?? "";
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(140);
  });
});

describe("staging smoke: the digest staging is running", () => {
  const OLDER = `sha256:${"e".repeat(64)}`;
  const running = (deployments: unknown[]) =>
    runStep(smoke, "smoke", "The digest staging is running", {
      context: { "secrets.GITHUB_TOKEN": "token", "github.repository": "o/r" },
      bins: { gh: fakeGh },
      fixtures: { "deployments.json": JSON.stringify(deployments) },
    });

  it("is the newest staging deployment that names a digest, with its id and the commit it was made for", () => {
    const r = running([
      { id: 31, ref: REF, payload: { description: "no digest in this one" } },
      { id: 30, ref: REF, payload: { image_digest: DIGEST } },
      { id: 29, ref: PREVIOUS_REF, payload: { image_digest: OLDER } },
    ]);
    expect(r.status).toBe(0);
    expect(r.outputs).toMatchObject({ found: "true", id: "30", digest: DIGEST, ref: REF });
  });

  it("reads a payload that came back as a JSON string", () => {
    const r = running([{ id: 30, ref: REF, payload: JSON.stringify({ image_digest: DIGEST }) }]);
    expect(r.outputs).toMatchObject({ found: "true", id: "30", digest: DIGEST });
  });

  it("finds nothing to smoke on a host that never deployed, and says so without failing the run", () => {
    const r = running([]);
    expect(r.status).toBe(0);
    expect(r.outputs.found).toBe("false");
    expect(r.stderr).toContain("nothing to smoke");
  });
});

describe("staging smoke: when it runs", () => {
  const condition = /^ {4}if: >-\n((?: {6}.*\n)+)/m.exec(smoke.text)?.[1].replace(/\s+/g, " ").trim() ?? "";

  it("runs on a schedule, by hand and when a Deployment gets a status", () => {
    expect(smoke.text).toMatch(/^on:\n {2}workflow_dispatch:\n {2}schedule:\n {4}- cron: "\*\/15 \* \* \* \*"\n(?: {2}#.*\n)*? {2}deployment_status:\n/m);
  });

  it("for a deployment_status only a staging deployment that succeeded counts, and never the smoke test's own status", () => {
    expect(condition).toContain("github.event_name != 'deployment_status'");
    expect(condition).toContain("github.event.deployment_status.state == 'success'");
    expect(condition).toContain("github.event.deployment.environment == 'staging'");
    expect(condition).toContain("!startsWith(github.event.deployment_status.description, 'smoke test ')");
  });

  it("hands the Deployment it found, its commit and its digest to the step that records", () => {
    const running = smoke.step("smoke", "The digest staging is running");
    expect(running.run).toMatch(/echo "id=/);
    expect(running.run).toMatch(/echo "ref=/);
    expect(running.run).toMatch(/echo "digest=/);
  });

  it("checks out the commit staging runs, after it has found it, rather than a ref the triggering event may not carry", () => {
    const steps = smoke.job("smoke").steps;
    const running = steps.findIndex((step) => step.id === "running");
    const checkout = steps.findIndex((step) => step.uses?.startsWith("actions/checkout@"));
    expect(running).toBeGreaterThanOrEqual(0);
    expect(checkout).toBeGreaterThan(running);
    expect(steps[checkout].with.ref).toBe("${{ steps.running.outputs.ref }}");
    expect(steps[checkout].if).toBe("steps.running.outputs.found == 'true'");
  });
});
