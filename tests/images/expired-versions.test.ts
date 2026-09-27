import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deployedDigest } from "../../scripts/migrations/deployed-release";
import { expiredVersions } from "../../scripts/images/expired-versions";

// GitHub does not keep images for a private repository on the Free plan, so
// every merge to main leaves one more `sha-<commit>` version in ghcr and they
// pile up forever. The monthly workflow deletes the old ones, and the only
// versions it may ever name are ones that carry nothing but `sha-<commit>` tags
// and that neither staging nor production is running.
//
// The one rule that is not about age: if the deployments cannot be read, or
// hold nothing that succeeded, then nothing has been *proved* not to be
// deployed, and an unproved version is kept. That is the same direction as the
// host script, which refuses when it cannot read what it is running.
const digest = (n: number): string => `sha256:${String(n).repeat(64)}`;
const sha = (n: number): string => `sha-${String(n).repeat(40)}`;
const daysAgo = (days: number, from = new Date("2026-09-27T00:00:00Z")): string =>
  new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const NOW = new Date("2026-09-27T00:00:00Z");
const RUNNING = digest(9);

/** A ghcr container version, the shape the packages API returns. */
const version = (n: number, options: { tags?: string[]; age?: number } = {}) => ({
  name: digest(n),
  created_at: daysAgo(options.age ?? 0),
  metadata: { container: { tags: options.tags ?? [sha(n)] } },
});

const options = (over: Partial<Parameters<typeof expiredVersions>[1]> = {}) => ({
  keep: [RUNNING],
  deployed: true,
  now: NOW,
  maxAgeDays: 30,
  ...over,
});

describe("the ghcr versions past their age", () => {
  it("are the sha-<commit> versions nothing runs, older than the age to keep", () => {
    const versions = [version(1, { age: 45 }), version(2, { age: 31 }), version(3, { age: 29 }), version(4, { age: 45 })];
    expect(expiredVersions(versions, options({ keep: [digest(4)] }))).toEqual([digest(1), digest(2)]);
  });

  it("keep the version staging and production are running, however old it is", () => {
    // A roll back deploys a digest from months ago; that is exactly the version
    // the host still needs to pull.
    const versions = [version(1, { age: 200 }), version(2, { age: 200 })];
    expect(expiredVersions(versions, options({ keep: [digest(1), digest(2)] }))).toEqual([]);
  });

  it("never name a release tag, or the latest tag the staging host follows", () => {
    const versions = [
      version(1, { age: 90, tags: [sha(1), "v2026.06.01-1"] }),
      version(2, { age: 90, tags: [sha(2), "latest"] }),
      version(3, { age: 90, tags: ["latest"] }),
    ];
    expect(expiredVersions(versions, options({ keep: [] }))).toEqual([]);
  });

  it("keep any tag that is not a plain commit, even next to one that is", () => {
    const versions = [version(1, { age: 90, tags: [sha(1), "edge"] })];
    expect(expiredVersions(versions, options({ keep: [] }))).toEqual([]);
  });

  it("come back oldest first, so the summary reads like a history", () => {
    const versions = [version(3, { age: 40 }), version(1, { age: 90 }), version(2, { age: 60 })];
    expect(expiredVersions(versions, options({ keep: [] }))).toEqual([digest(1), digest(2), digest(3)]);
  });

  it("are named when the page of versions arrives as several pages", () => {
    // `gh api --paginate` writes one JSON array per page into one file.
    const pages = [[version(1, { age: 90 })], [version(2, { age: 5 })]];
    expect(expiredVersions(pages, options({ keep: [] }))).toEqual([digest(1)]);
  });

  it("are nothing at all when the API answers with something else, so a broken run deletes nothing", () => {
    for (const answer of [null, "not json", { message: "Not Found" }, 42, [{ name: "sha256:x" }]]) {
      expect(expiredVersions(answer, options({ keep: [] }))).toEqual([]);
    }
  });

  it("are nothing when a version says when it was created in a way that cannot be read", () => {
    const versions = [{ ...version(1, { age: 90 }), created_at: "yesterday" }];
    expect(expiredVersions(versions, options({ keep: [] }))).toEqual([]);
  });

  it("are none of them when nothing proves what is deployed", () => {
    // GitHub purges old deployments, so an empty or unreadable list is the
    // normal state after a while, and age alone must not decide. The host
    // script refuses in the same situation; here the run has to keep every
    // version instead of failing, and say so.
    const versions = [version(1, { age: 90 }), version(2, { age: 200 })];
    expect(expiredVersions(versions, options({ keep: [], deployed: false }))).toEqual([]);
  });

  it("come back once a successful deployment is on the record to compare against", () => {
    const versions = [version(1, { age: 90 }), version(2, { age: 5 })];
    expect(expiredVersions(versions, options({ deployed: true }))).toEqual([digest(1)]);
  });
});

describe("the retention run itself", () => {
  const script = fileURLToPath(new URL("../../scripts/images/expired-versions.ts", import.meta.url));

  /** Runs the CLI over the two files the workflow writes, and says what it named. */
  function run(versions: unknown, deployments: unknown) {
    const dir = mkdtempSync(path.join(tmpdir(), "makam-retention-"));
    const versionsFile = path.join(dir, "versions.json");
    const deploymentsFile = path.join(dir, "deployments.json");
    writeFileSync(versionsFile, JSON.stringify(versions));
    writeFileSync(deploymentsFile, JSON.stringify(deployments));
    const result = spawnSync("npx", ["--no-install", "tsx", script, versionsFile, deploymentsFile], {
      encoding: "utf8",
      env: { ...process.env, PATH: `${process.env.PATH}` },
    });
    return { code: result.status, output: result.stdout.trim(), error: result.stderr };
  }

  it("names nothing and fails when the deployments list is empty", () => {
    const old = [version(1, { age: 90 }), version(2, { age: 120 })];
    const result = run(old, []);
    expect(result.output).toBe("");
    // 78, the same "refusing, do nothing" code makam-prune-images uses.
    expect(result.code).toBe(78);
    expect(result.error).toMatch(/proved/);
  });

  it("names nothing and fails when the deployments list is not a list at all", () => {
    const result = run([version(1, { age: 90 })], { message: "Not Found" });
    expect(result.output).toBe("");
    expect(result.code).toBe(78);
  });

  it("names the old ones when a successful deployment says what is running", () => {
    const deployments = [
      { state: "success", environment: "production", payload: { image_digest: digest(2) } },
      { state: "failure", environment: "staging", payload: { image_digest: digest(1) } },
    ];
    const result = run([version(1, { age: 90 }), version(2, { age: 120 }), version(3, { age: 2 })], deployments);
    // The digest production runs survives however old it is; the failed
    // staging attempt is not something anything is running.
    expect(result.output.split("\n")).toEqual([digest(1)]);
    expect(result.code).toBe(0);
  });
});

describe("the digest a deployment is running", () => {
  it("is the one a successful deployment names", () => {
    expect(deployedDigest({ state: "success", payload: { image_digest: digest(1) } })).toBe(digest(1));
  });

  it("is nothing when the deployment did not succeed, so an attempt is not a reason to keep a version", () => {
    for (const state of ["failure", "error", "in_progress", "pending", "inactive"]) {
      expect(deployedDigest({ state, payload: { image_digest: digest(1) } })).toBe("");
    }
  });
});
