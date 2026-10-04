import { spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

// Promosikan ke produksi and Roll back production: the shell of the steps that
// decide run here against a fake gh, so the tag count, the healthy check and
// the draft-sign-publish order are proved without GitHub.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const DIGEST = `sha256:${"a".repeat(64)}`;
const OTHER = `sha256:${"b".repeat(64)}`;
const dirs: string[] = [];

type Step = { name?: string; id?: string; run?: string; uses?: string; if?: string; env?: Record<string, string> };
type Job = { needs?: string | string[]; env?: Record<string, string>; outputs?: Record<string, string>; steps: Step[] };
type Workflow = { jobs: Record<string, Job> };

const promoteText = readFileSync(path.join(repo, ".github/workflows/promote.yml"), "utf8");
const rollbackText = readFileSync(path.join(repo, ".github/workflows/rollback.yml"), "utf8");
const promote = parse(promoteText) as Workflow;
const rollback = parse(rollbackText) as Workflow;

function step(w: Workflow, job: string, name: string): Step {
  const s = w.jobs[job]?.steps.find((x) => x.name === name);
  if (!s) throw new Error(`no step ${name} in ${job}`);
  return s;
}

// Runs a step's script the way GitHub does (bash -eo pipefail) with a fake gh
// whose body is given, and returns what it wrote.
function run(s: Step, ghBody: string, env: Record<string, string> = {}) {
  const root = mkdtempSync(path.join(tmpdir(), "makam-promote-"));
  dirs.push(root);
  mkdirSync(path.join(root, "bin"));
  const calls = path.join(root, "calls.log");
  const out = path.join(root, "output");
  writeFileSync(out, "");
  writeFileSync(calls, "");
  writeFileSync(path.join(root, "bin/gh"), `#!/usr/bin/env bash\necho "$*" >> "${calls}"\n${ghBody}\n`);
  chmodSync(path.join(root, "bin/gh"), 0o755);
  const r = spawnSync("bash", ["-eo", "pipefail", "-c", s.run ?? "exit 99"], {
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${root}/bin:${process.env.PATH}`,
      GITHUB_OUTPUT: out,
      GITHUB_REPOSITORY: "o/r",
      GH_REPO: "o/r",
      GH_TOKEN: "t",
      ...env,
    },
  });
  return { status: r.status, stderr: r.stderr, stdout: r.stdout, output: readFileSync(out, "utf8"), calls: readFileSync(calls, "utf8") };
}

afterEach(() => {
  while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true });
});

type Rel = { tagName: string; createdAt: string; isDraft: boolean };
const rel = (tagName: string, createdAt: string, isDraft = false): Rel => ({ tagName, createdAt, isDraft });
const listing = (rels: Rel[]) => `cat <<'JSON'\n${JSON.stringify(rels)}\nJSON`;

describe("Promosikan ke produksi: the expected release tag", () => {
  const tagStep = () => step(promote, "check", "The release tag, typed again");
  const typed = (tag: string) => ({ RELEASE_TAG_INPUT: tag, TODAY_WIB: "2026.10.03" });

  it("is -1 when no release was created today", () => {
    const r = run(tagStep(), listing([]), typed("v2026.10.03-1"));
    expect(r.status).toBe(0);
    expect(r.output).toContain("tag=v2026.10.03-1");
  });

  it("counts the published releases of the day, not drafts or yesterday's", () => {
    const rels = [
      rel("v2026.10.03-2", "2026-10-03T05:00:00Z"),
      rel("v2026.10.03-1", "2026-10-03T03:00:00Z"),
      rel("v2026.10.03-3", "2026-10-03T06:00:00Z", true),
      rel("v2026.10.02-1", "2026-10-02T03:00:00Z"),
    ];
    const r = run(tagStep(), listing(rels), typed("v2026.10.03-3"));
    expect(r.status).toBe(0);
    expect(r.output).toContain("tag=v2026.10.03-3");
  });

  it("ignores a tag that does not start with v", () => {
    const r = run(tagStep(), listing([rel("nightly-1", "2026-10-03T03:00:00Z")]), typed("v2026.10.03-1"));
    expect(r.status).toBe(0);
  });

  it("refuses a typed tag that is not the expected one", () => {
    const r = run(tagStep(), listing([]), typed("v2026.10.03-2"));
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("v2026.10.03-1");
    expect(r.output).toBe("");
  });

  it("counts a release created at 18:00 UTC on the 3rd on the 4th (01:00 WIB)", () => {
    const rels = [rel("v2026.10.04-1", "2026-10-03T18:00:00Z")];
    const r = run(tagStep(), listing(rels), { RELEASE_TAG_INPUT: "v2026.10.04-2", TODAY_WIB: "2026.10.04" });
    expect(r.status).toBe(0);
    expect(r.output).toContain("tag=v2026.10.04-2");
  });
});

describe("Promosikan ke produksi: healthy means the host says so, and the smoke test passed", () => {
  const verified = () => step(promote, "check", "The digest staging runs, healthy, with a passed smoke test");
  type St = { state: string; description: string };
  const smoke = (d = DIGEST, state = "success"): St => ({ state, description: `smoke test against dev.makam.co.id for ${d}: ${state}` });
  const healthy = (d = DIGEST): St => ({ state: "success", description: `v2026.10.03-1 (${d}) healthy` });

  function check(statuses: St[]) {
    const deployments = [{ id: 7, ref: "abc1234", payload: { image_digest: DIGEST } }];
    const gh = `case "$*" in\n*statuses*) cat <<'JSON'\n${JSON.stringify(statuses)}\nJSON\n;;\n*deployments*) cat <<'JSON'\n${JSON.stringify(deployments)}\nJSON\n;;\nesac`;
    return run(verified(), gh);
  }

  it("passes with the host's healthy status and the smoke success, and exports digest and sha", () => {
    const r = check([smoke(), healthy()]);
    expect(r.status).toBe(0);
    expect(r.output).toContain(`digest=${DIGEST}`);
    expect(r.output).toContain("sha=abc1234");
  });

  it("refuses a digest with only the smoke success", () => {
    const r = check([smoke()]);
    expect(r.status).toBe(1);
    expect(r.output).toBe("");
  });

  it("refuses a digest with only the host's healthy status", () => {
    expect(check([healthy()]).status).toBe(1);
  });

  it("refuses when the host's healthy status is for a different digest", () => {
    expect(check([smoke(), healthy(OTHER)]).status).toBe(1);
  });

  it("refuses a failed smoke test even when the host is healthy", () => {
    expect(check([smoke(DIGEST, "failure"), healthy()]).status).toBe(1);
  });
});

describe("Promosikan ke produksi: the release is a draft until the production signature exists", () => {
  const steps = promote.jobs["sign-and-release"].steps;
  const idx = (f: (s: Step) => boolean) => steps.findIndex(f);
  const create = idx((s) => /gh release create/.test(s.run ?? ""));
  const sign = idx((s) => (s.uses ?? "").includes("cosign-sign"));
  const publish = idx((s) => /--draft=false/.test(s.run ?? ""));

  it("creates the release, then signs, then publishes", () => {
    expect(create).toBeGreaterThanOrEqual(0);
    expect(create).toBeLessThan(sign);
    expect(sign).toBeLessThan(publish);
    expect(steps[create].run).toContain("--draft");
  });

  it("uses the tag the check job exports", () => {
    expect(promote.jobs["sign-and-release"].env?.RELEASE_TAG).toBe("${{ needs.check.outputs.tag }}");
  });

  const draftStep = () => steps[create];
  const env = { RELEASE_TAG: "v2026.10.03-2", DIGEST, SHA: "abc1234", REASON: "perbaikan $(touch pwned)" };
  const ghFor = (view: string) =>
    `case "$*" in\n"release view"*) ${view};;\n"release list"*) cat <<'JSON'\n${JSON.stringify([
      rel("v2026.10.03-2", "2026-10-03T05:00:00Z", true),
      rel("v2026.10.03-9", "2026-10-03T05:00:00Z", true),
      rel("v2026.10.03-1", "2026-10-03T03:00:00Z"),
    ])}\nJSON\n;;\nesac`;

  it("creates a draft naming the digest, from the previous published release only", () => {
    const r = run(draftStep(), ghFor('echo "release not found" >&2; exit 1'), env);
    expect(r.status).toBe(0);
    expect(r.calls).toContain("release create v2026.10.03-2");
    expect(r.calls).toContain("--draft");
    expect(r.calls).toContain("--notes-start-tag v2026.10.03-1");
    expect(r.calls).toContain(DIGEST);
    expect(r.calls).toContain("perbaikan $(touch pwned)");
  });

  it("a re-run finds the draft and does not create it again", () => {
    const r = run(draftStep(), ghFor('echo \'{"isDraft":true}\''), env);
    expect(r.status).toBe(0);
    expect(r.calls).not.toContain("release create");
    expect(r.output).toContain("published=false");
  });

  it("a re-run finds the published release and leaves publishing to nobody", () => {
    const r = run(draftStep(), ghFor('echo \'{"isDraft":false}\''), env);
    expect(r.status).toBe(0);
    expect(r.calls).not.toContain("release create");
    expect(r.output).toContain("published=true");
    expect(steps[publish].if).toContain("published");
  });

  it("stops on a lookup error that is not 'not found'", () => {
    const r = run(draftStep(), ghFor('echo "HTTP 500: boom" >&2; exit 1'), env);
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("HTTP 500: boom");
    expect(r.calls).not.toContain("release create");
  });
});

describe("the promotion workflows: shape", () => {
  const all: [string, string, Workflow][] = [
    ["promote.yml", promoteText, promote],
    ["rollback.yml", rollbackText, rollback],
  ];

  it.each(all)("%s: every step that calls gh has GH_TOKEN and GH_REPO", (_n, _t, w) => {
    for (const job of Object.values(w.jobs)) {
      for (const s of job.steps) {
        if (!/(^|[\s(`|;&])gh (api|release|run|pr|issue)\b/m.test(s.run ?? "")) continue;
        const env = { ...job.env, ...s.env };
        expect(env.GH_TOKEN, `${s.name}: GH_TOKEN`).toBeTruthy();
        expect(env.GH_REPO, `${s.name}: GH_REPO`).toBe("${{ github.repository }}");
      }
    }
  });

  it.each(all)("%s: no input is interpolated into a shell script", (_n, _t, w) => {
    for (const job of Object.values(w.jobs)) {
      for (const s of job.steps) expect(s.run ?? "", s.name).not.toMatch(/\$\{\{\s*inputs\./);
    }
  });

  it.each(all)("%s: every needs.<job>.outputs.<x> is an output of that job", (_n, text, w) => {
    const refs = [...text.matchAll(/needs\.([\w-]+)\.outputs\.([\w-]+)/g)];
    if (text === promoteText) expect(refs.length).toBeGreaterThan(0);
    for (const [, job, out] of refs) expect(w.jobs[job]?.outputs?.[out], `${job}.${out}`).toBeTruthy();
  });
});

describe("Roll back production: the release lookup", () => {
  const lookup = () => step(rollback, "rollback", "The release exists, and the digest it went out as");

  it("shows gh's real error and does not claim there is no release", () => {
    const r = run(lookup(), 'echo "HTTP 403: Resource not accessible" >&2; exit 1', { RELEASE_TAG: "v2026.09.27-1" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("HTTP 403: Resource not accessible");
    expect(r.stderr).not.toContain("there is no release");
  });
});
