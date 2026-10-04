import { afterEach, describe, expect, it } from "vitest";
import { cleanSandboxes, fakeGh, readWorkflow, runStep, type RunResult } from "../support/workflow";

// "Promosikan ke produksi" and "Roll back production" never ran before the
// first promotion (ticket 106), and a mistake in either is the one with no
// undo: a digest signed with the production key. So the steps' own shell runs
// here, against a fake gh that needs GH_TOKEN and GH_REPO like the real one on
// a runner with no checkout, with the real jq answering the steps' filters.
const DIGEST = `sha256:${"a".repeat(64)}`;
const OTHER_DIGEST = `sha256:${"b".repeat(64)}`;
const SHA = "c".repeat(40);
const TAG = "v2026.10.04-1";

const promote = readWorkflow("promote.yml");
const rollback = readWorkflow("rollback.yml");
const smoke = readWorkflow("staging-smoke.yml");

const TAG_STEP = "The release tag, typed again";
const VERIFIED_STEP = "The digest staging runs, healthy, with a passed smoke test";
const DRAFT_STEP = "The release, as a draft naming the digest";
const PUBLISH_STEP = "Publish the release";
const LOOKUP_STEP = "The release exists, and the digest it went out as";
const RECORD_STEP = "Record the rollback as a production deployment";

const github = { "secrets.GITHUB_TOKEN": "token", "github.repository": "o/r" };

afterEach(cleanSandboxes);

describe("Promosikan ke produksi: what one job hands the next", () => {
  it("is read in full: both jobs and their steps", () => {
    expect(promote.jobs.map((job) => job.id)).toEqual(["check", "sign-and-release"]);
    expect(promote.job("check").steps).toHaveLength(3);
    expect(promote.job("sign-and-release").steps.length).toBeGreaterThanOrEqual(5);
  });

  it("check exports the tag, the digest and the commit that sign-and-release reads", () => {
    expect(Object.keys(promote.job("check").outputs).sort()).toEqual(["digest", "sha", "tag"]);
    expect(promote.job("check").outputs.tag).toBe("${{ steps.tag.outputs.tag }}");
  });

  it.each([
    ["promote.yml", promote],
    ["rollback.yml", rollback],
    ["staging-smoke.yml", smoke],
  ])("every output %s reads from another job or step is one that job or step exports", (_name, workflow) => {
    const reads = [...workflow.text.matchAll(/needs\.([\w-]+)\.outputs\.([\w-]+)/g)];
    for (const [, job, output] of reads) expect(Object.keys(workflow.job(job).outputs), `needs.${job}.outputs.${output}`).toContain(output);
    for (const job of workflow.jobs) {
      const reading = [...Object.values(job.outputs), ...Object.values(job.env), ...job.steps.map((step) => step.text)].join("\n");
      for (const [, id, output] of reading.matchAll(/steps\.([\w-]+)\.outputs\.([\w-]+)/g)) {
        const writer = job.steps.find((step) => step.id === id);
        expect(writer, `${job.id}: steps.${id} is a step of the job`).toBeDefined();
        // An action's own outputs (cache-hit, digest...) are its business; a script's are what it writes to GITHUB_OUTPUT.
        if (writer?.uses === undefined) expect(writer?.run ?? "", `${job.id}: step ${id} writes ${output}`).toMatch(new RegExp(`(^|[\\s"])${output}=`));
      }
    }
  });

  it.each([
    ["promote.yml", promote],
    ["rollback.yml", rollback],
    ["staging-smoke.yml", smoke],
  ])("every step of %s that runs gh has GH_TOKEN and GH_REPO, so none depends on a checkout to find the repository", (_name, workflow) => {
    const ghSteps = workflow.jobs.flatMap((job) =>
      job.steps.filter((step) => /(^|[\s(|;&"'])gh (api|release)/m.test(step.run ?? "")).map((step) => ({ job, step })),
    );
    expect(ghSteps.length).toBeGreaterThan(0);
    for (const { job, step } of ghSteps) {
      const env = { ...job.env, ...step.env };
      expect(env.GH_TOKEN, `${step.name}: GH_TOKEN`).toBe("${{ secrets.GITHUB_TOKEN }}");
      expect(env.GH_REPO, `${step.name}: GH_REPO`).toBe("${{ github.repository }}");
    }
  });

  it.each([
    ["promote.yml", promote],
    ["rollback.yml", rollback],
  ])("no run script of %s holds a ${{ }} expression: the owner's inputs reach the shell through env, so a reason with a quote or a $ breaks nothing", (_name, workflow) => {
    for (const job of workflow.jobs) for (const step of job.steps) expect(step.run ?? "", `${job.id}: ${step.name}`).not.toContain("${{");
  });

  it.each([
    ["promote.yml", promote],
    ["rollback.yml", rollback],
    ["staging-smoke.yml", smoke],
  ])("every script of %s runs under bash with pipefail, so a failing gh is not read as an empty answer", (_name, workflow) => {
    expect(workflow.text).toMatch(/^defaults:\n {2}run:\n {4}shell: bash$/m);
  });

  it("creates the release as a draft, signs the digest with the production key, and only then publishes", () => {
    const steps = promote.job("sign-and-release").steps;
    const draft = steps.findIndex((step) => step.name === DRAFT_STEP);
    const sign = steps.findIndex((step) => step.uses === "./.github/actions/cosign-sign");
    const publish = steps.findIndex((step) => step.name === PUBLISH_STEP);
    expect(draft).toBeGreaterThanOrEqual(0);
    expect(draft).toBeLessThan(sign);
    expect(sign).toBeLessThan(publish);
    expect(steps[sign].with["private-key"]).toBe("${{ secrets.COSIGN_PROD_PRIVATE_KEY }}");
    expect(steps[sign].with.image).toContain("${{ needs.check.outputs.digest }}");
    expect(promote.text).not.toContain("COSIGN_STAGING");
  });
});

/** `gh release list --json tagName,isDraft,publishedAt`: createdAt is a commit date, deliberately unrelated to the day. */
function releaseList(...releases: Array<{ tag: string; at?: string; draft?: boolean }>): string {
  return JSON.stringify(
    releases.map((r) => ({ tagName: r.tag, isDraft: r.draft ?? false, publishedAt: r.draft ? null : (r.at ?? null), createdAt: "2026-01-02T03:04:05Z" })),
  );
}
/** `TZ=Asia/Jakarta date +%Y.%m.%d` answers the WIB day; a plain `date` answers the runner's UTC day. */
const dateShim = `if [ "\${TZ:-}" = "Asia/Jakarta" ]; then echo "$FAKE_DATE_WIB"; else echo "$FAKE_DATE_UTC"; fi`;

function typeTag(typed: string, releases: string | undefined, today = { wib: "2026.10.04", utc: "2026.10.04" }): RunResult {
  return runStep(promote, "check", TAG_STEP, {
    context: { ...github, "inputs.release_tag": typed },
    bins: { gh: fakeGh, date: dateShim },
    env: { FAKE_DATE_WIB: today.wib, FAKE_DATE_UTC: today.utc },
    fixtures: releases === undefined ? {} : { "release-list.json": releases },
  });
}

describe("Promosikan ke produksi: the release tag, typed again", () => {
  it("the first promotion of the day expects N = 1 and exports the tag", () => {
    const r = typeTag(TAG, releaseList());
    expect(r.status).toBe(0);
    expect(r.outputs.tag).toBe(TAG);
    expect(r.calls.some((call) => call.startsWith("gh release list"))).toBe(true);
  });

  it("N counts the non-draft v releases published that day in WIB, plus 1: not drafts, not other days, not other tags", () => {
    const releases = releaseList(
      { tag: "v2026.10.04-1", at: "2026-10-04T03:00:00Z" },
      { tag: "v2026.10.04-2", at: "2026-10-04T08:00:00Z" },
      { tag: "v2026.10.04-3", draft: true },
      { tag: "v2026.10.03-1", at: "2026-10-03T08:00:00Z" },
      { tag: "v2026.10.03-2", at: "2026-10-03T16:59:00Z" },
      { tag: "staging-2026.10.04", at: "2026-10-04T05:00:00Z" },
    );
    expect(typeTag("v2026.10.04-3", releases).status).toBe(0);
    const wrong = typeTag("v2026.10.04-4", releases);
    expect(wrong.status).toBe(1);
    expect(wrong.stderr).toContain("typed exactly as v2026.10.04-3");
  });

  it("a release published after 17:00 UTC already belongs to the next WIB day", () => {
    const releases = releaseList({ tag: "v2026.10.05-1", at: "2026-10-04T17:30:00Z" });
    const today = { wib: "2026.10.05", utc: "2026.10.04" };
    expect(typeTag("v2026.10.05-2", releases, today).status).toBe(0);
    // ... and it does not count for the WIB day it was not published on.
    expect(typeTag("v2026.10.04-1", releaseList({ tag: "v2026.10.05-1", at: "2026-10-04T17:30:00Z" })).status).toBe(0);
  });

  it("the day is the WIB day, not the runner's UTC day", () => {
    const r = typeTag("v2026.10.04-1", releaseList(), { wib: "2026.10.05", utc: "2026.10.04" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("typed exactly as v2026.10.05-1");
  });

  it("a gh that fails is not read as 'no releases yet'", () => {
    const r = typeTag(TAG, undefined);
    expect(r.status).not.toBe(0);
    expect(r.outputs.tag).toBeUndefined();
  });
});

const deployment = (extra: Record<string, unknown> = {}) => ({ id: 77, ref: SHA, environment: "staging", payload: { image_digest: DIGEST }, ...extra });
const status = (state: string, description: string, createdAt: string) => ({ state, description, created_at: createdAt });
const hostHealthy = (digest = DIGEST) => status("success", `sha-${SHA} (${digest}) healthy`, "2026-10-04T05:02:00Z");
const smokeStatus = (state: "success" | "failure", at: string, digest = DIGEST) =>
  status(state, `smoke test against dev.makam.co.id for ${digest}: ${state}`, at);
const inProgress = status("in_progress", `migrate and restart makam-staging on sha-${SHA}`, "2026-10-04T05:00:00Z");

function verify(statuses: unknown[] | string, deployments: unknown[] = [deployment()]): RunResult {
  return runStep(promote, "check", VERIFIED_STEP, {
    context: github,
    bins: { gh: fakeGh },
    fixtures: {
      "deployments.json": JSON.stringify(deployments),
      "statuses.json": typeof statuses === "string" ? statuses : JSON.stringify(statuses),
    },
  });
}

describe("Promosikan ke produksi: a healthy staging digest with a passed smoke test", () => {
  it("promotes the digest the host reports healthy and the smoke test passed, and exports it with its commit", () => {
    const r = verify([inProgress, hostHealthy(), smokeSuccess()]);
    expect(r.status).toBe(0);
    expect(r.outputs.digest).toBe(DIGEST);
    expect(r.outputs.sha).toBe(SHA);
  });

  it("the smoke test's own success is not proof that staging is healthy: a digest that failed and rolled back is refused", () => {
    const failed = status("failure", `sha-${SHA} (${DIGEST}) never became healthy; rolling back to sha-${"d".repeat(40)}`, "2026-10-04T05:03:00Z");
    const r = verify([inProgress, failed, smokeSuccess()]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("healthy");
    expect(r.outputs.digest).toBeUndefined();
  });

  it("a healthy status the host wrote for another digest does not count", () => {
    expect(verify([inProgress, hostHealthy(OTHER_DIGEST), smokeSuccess()]).status).toBe(1);
  });

  it("a status that merely ends '(digest) healthy' but is not a success does not count", () => {
    const pending = status("in_progress", `sha-${SHA} (${DIGEST}) healthy`, "2026-10-04T05:02:00Z");
    expect(verify([inProgress, pending, smokeSuccess()]).status).toBe(1);
  });

  it("still needs the smoke test to have passed for the digest", () => {
    const r = verify([inProgress, hostHealthy()]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("smoke test");
    expect(verify([inProgress, hostHealthy(), smokeSuccess("2026-10-04T05:10:00Z", OTHER_DIGEST)]).status).toBe(1);
  });

  it("the newest smoke result decides: a failure recorded after a success refuses", () => {
    const r = verify([inProgress, hostHealthy(), smokeSuccess("2026-10-04T05:10:00Z"), smokeStatus("failure", "2026-10-04T05:25:00Z")]);
    expect(r.status).toBe(1);
    expect(verify([inProgress, hostHealthy(), smokeStatus("failure", "2026-10-04T05:10:00Z"), smokeSuccess("2026-10-04T05:25:00Z")]).status).toBe(0);
  });

  it("reads every page of statuses: the host's status is still found behind a hundred smoke runs", () => {
    const smokes = Array.from({ length: 30 }, (_, i) => smokeSuccess(`2026-10-05T10:${String(i).padStart(2, "0")}:00Z`));
    const newestFirst = [...smokes].reverse();
    const pages = `${JSON.stringify(newestFirst)}\n${JSON.stringify([hostHealthy(), inProgress])}\n`;
    expect(verify(pages).status).toBe(0);
  });

  it("refuses a staging deployment whose ref is not a full commit SHA (the release is created at that commit)", () => {
    const r = verify([inProgress, hostHealthy(), smokeSuccess()], [deployment({ ref: `sha-${SHA}` })]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("commit");
  });

  it("refuses when staging has no recorded deployment", () => {
    expect(verify([], []).status).toBe(1);
  });

  it("reads a payload GitHub returns as a JSON string (a Deployment made with -F payload=...), and skips one that is neither", () => {
    const asString = deployment({ payload: JSON.stringify({ image_digest: DIGEST }) });
    const r = verify([inProgress, hostHealthy(), smokeSuccess()], [asString]);
    expect(r.status).toBe(0);
    expect(r.outputs.digest).toBe(DIGEST);
    const junk = deployment({ id: 1, payload: "not json at all" });
    expect(verify([inProgress, hostHealthy(), smokeSuccess()], [junk, deployment()]).outputs.digest).toBe(DIGEST);
  });
});

function smokeSuccess(at = "2026-10-04T05:05:00Z", digest = DIGEST) {
  return smokeStatus("success", at, digest);
}

/** The releases as the REST API lists them (draft ones too, to a token with contents: write). */
const apiRelease = (id: number, tag: string, extra: Record<string, unknown> = {}) => ({ id, tag_name: tag, draft: false, published_at: "2026-10-03T08:00:00Z", ...extra });

function draft(releases: unknown[], tag = TAG): RunResult {
  return runStep(promote, "sign-and-release", DRAFT_STEP, {
    context: {
      ...github,
      "needs.check.outputs.digest": DIGEST,
      "needs.check.outputs.sha": SHA,
      "needs.check.outputs.tag": tag,
      "inputs.reason": 'Fix the booking crash; "quote" and $(dollar) stay text',
    },
    bins: { gh: fakeGh },
    fixtures: {
      "releases.json": JSON.stringify(releases),
      "generate-notes.json": JSON.stringify({ name: tag, body: "## What's Changed\n* the generated list" }),
      "created-release.json": JSON.stringify({ id: 9001 }),
    },
  });
}
const posts = (r: RunResult) => r.calls.filter((call) => /--method POST repos\/o\/r\/releases( |$)/.test(call));
const patches = (r: RunResult) => r.calls.filter((call) => call.includes("--method PATCH"));

describe("Promosikan ke produksi: the draft release comes before the production signature", () => {
  it("a first run creates a draft at the staging commit whose notes name the digest, and hands on its id", () => {
    const r = draft([]);
    expect(r.status).toBe(0);
    expect(posts(r)).toHaveLength(1);
    const body = JSON.parse(r.stdins[r.stdins.length - 1]) as Record<string, unknown>;
    expect(body).toMatchObject({ tag_name: TAG, target_commitish: SHA, draft: true });
    expect(String(body.body)).toContain(DIGEST);
    expect(String(body.body)).toContain('"quote" and $(dollar) stay text');
    expect(String(body.body)).toContain("the generated list");
    expect(r.outputs.release_id).toBe("9001");
  });

  it("a re-run with the same tag after a failure finds the draft it left, updates it and completes", () => {
    const r = draft([apiRelease(555, TAG, { draft: true, published_at: null, body: `Fix\n\nProduction digest: \`${DIGEST}\`, built from \`${SHA}\`.` })]);
    expect(r.status).toBe(0);
    expect(posts(r)).toHaveLength(0);
    expect(patches(r)).toHaveLength(1);
    expect(patches(r)[0]).toContain("releases/555");
    expect(String(JSON.parse(r.stdins[r.stdins.length - 1]).body)).toContain(DIGEST);
    expect(r.outputs.release_id).toBe("555");
  });

  it("never takes over a draft that names another digest: that digest may already carry the production signature, and its release must keep naming it", () => {
    const stale = apiRelease(555, TAG, { draft: true, published_at: null, body: `Production digest: \`${OTHER_DIGEST}\`` });
    const r = draft([stale]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("another digest");
    expect(posts(r)).toHaveLength(0);
    expect(patches(r)).toHaveLength(0);
    expect(draft([apiRelease(555, TAG, { draft: true, published_at: null, body: null })]).status).toBe(1);
  });

  it("refuses a tag that is already a published release", () => {
    const r = draft([apiRelease(1, TAG)]);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("already published");
    expect(posts(r)).toHaveLength(0);
    expect(patches(r)).toHaveLength(0);
  });

  it("the notes continue from the newest published release, and from the start when there is none", () => {
    const withPrevious = draft([apiRelease(2, "v2026.10.03-1", { published_at: "2026-10-03T08:00:00Z" }), apiRelease(1, "v2026.10.02-1", { published_at: "2026-10-02T08:00:00Z" })]);
    expect(withPrevious.calls.find((call) => call.includes("generate-notes"))).toContain("previous_tag_name=v2026.10.03-1");
    const first = draft([]);
    expect(first.calls.find((call) => call.includes("generate-notes"))).not.toContain("previous_tag_name");
  });

  it("publishes the draft by its id, as a release rather than a draft", () => {
    const r = runStep(promote, "sign-and-release", PUBLISH_STEP, {
      context: { ...github, "steps.draft.outputs.release_id": "9001", "needs.check.outputs.digest": DIGEST, "needs.check.outputs.tag": TAG },
      bins: { gh: fakeGh },
    });
    expect(r.status).toBe(0);
    expect(patches(r)).toHaveLength(1);
    expect(patches(r)[0]).toContain("releases/9001");
    expect(patches(r)[0]).toContain("draft=false");
  });
});

const releaseView = JSON.stringify({ tagName: TAG, targetCommitish: SHA, isDraft: false });
const productionDeployments = JSON.stringify([
  { id: 12, ref: "e".repeat(40), environment: "production", payload: { image_digest: OTHER_DIGEST } },
  { id: 9, ref: SHA, environment: "production", payload: { image_digest: DIGEST } },
]);

function lookup(fixtures: Record<string, string>): RunResult {
  return runStep(rollback, "rollback", LOOKUP_STEP, {
    context: { ...github, "inputs.release_tag": TAG },
    bins: { gh: fakeGh },
    fixtures: { "deployments.json": productionDeployments, ...fixtures },
  });
}

describe("Roll back production: the release it goes back to", () => {
  it("finds the release and the digest it went out as, through GH_REPO", () => {
    const r = lookup({ [`release-view-${TAG}.json`]: releaseView });
    expect(r.status).toBe(0);
    expect(r.outputs).toMatchObject({ tag: TAG, sha: SHA, digest: DIGEST });
  });

  it("finds the digest in a production deployment whose payload came back as a JSON string", () => {
    const asString = [{ id: 9, ref: SHA, environment: "production", payload: JSON.stringify({ image_digest: DIGEST }) }];
    const r = lookup({ [`release-view-${TAG}.json`]: releaseView, "deployments.json": JSON.stringify(asString) });
    expect(r.status).toBe(0);
    expect(r.outputs.digest).toBe(DIGEST);
  });

  it("says there is no such release only when gh says so", () => {
    const r = lookup({});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`there is no release ${TAG}`);
  });

  it("reports the real error when the lookup fails for any other reason", () => {
    const r = lookup({ "release-view-error.txt": "HTTP 401: Bad credentials (https://api.github.com/repos/o/r/releases/tags/v2026.10.04-1)\n" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("HTTP 401: Bad credentials");
    expect(r.stderr).not.toContain("there is no release");
  });

  it("refuses a draft: it never went out", () => {
    const r = lookup({ [`release-view-${TAG}.json`]: JSON.stringify({ tagName: TAG, targetCommitish: SHA, isDraft: true }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("draft");
  });

  it("refuses a release no production deployment records a digest for", () => {
    const r = lookup({ [`release-view-${TAG}.json`]: releaseView, "deployments.json": "[]" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("never reached production");
  });
});

describe("Roll back production: the rollback recorded as a production deployment", () => {
  const record = (reason: string) =>
    runStep(rollback, "rollback", RECORD_STEP, {
      context: { ...github, "inputs.release_tag": TAG, "inputs.reason": reason, "steps.release.outputs.digest": DIGEST, "steps.release.outputs.sha": SHA },
      bins: { gh: fakeGh },
    });

  it("creates the deployment at the release's commit with the digest as an object and no required status contexts", () => {
    const r = record("short reason");
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdins[0])).toMatchObject({ ref: SHA, environment: "production", auto_merge: false, required_contexts: [], payload: { image_digest: DIGEST } });
  });

  it("keeps the status description within GitHub's 140 characters however long the reason is", () => {
    const r = record("x".repeat(400));
    expect(r.status).toBe(0);
    const body = JSON.parse(r.stdins[1]) as { state: string; description: string };
    expect(body.state).toBe("in_progress");
    expect(body.description.length).toBeLessThanOrEqual(140);
    expect(body.description).toContain(TAG);
  });
});
