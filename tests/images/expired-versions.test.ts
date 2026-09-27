import { describe, expect, it } from "vitest";
import { deployedDigest } from "../../scripts/migrations/deployed-release";
import { expiredVersions } from "../../scripts/images/expired-versions";

// GitHub does not keep images for a private repository on the Free plan, so
// every merge to main leaves one more `sha-<commit>` version in ghcr and they
// pile up forever. The monthly workflow deletes the old ones, and the only
// versions it may ever name are ones that carry nothing but `sha-<commit>` tags
// and that neither staging nor production is running.
const digest = (n: number): string => `sha256:${String(n).repeat(64)}`;
const sha = (n: number): string => `sha-${String(n).repeat(40)}`;
const daysAgo = (days: number, from = new Date("2026-09-27T00:00:00Z")): string =>
  new Date(from.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
const NOW = new Date("2026-09-27T00:00:00Z");

/** A ghcr container version, the shape the packages API returns. */
const version = (n: number, options: { tags?: string[]; age?: number } = {}) => ({
  name: digest(n),
  created_at: daysAgo(options.age ?? 0),
  metadata: { container: { tags: options.tags ?? [sha(n)] } },
});

describe("the ghcr versions past their age", () => {
  it("are the sha-<commit> versions nothing runs, older than the age to keep", () => {
    const versions = [version(1, { age: 45 }), version(2, { age: 31 }), version(3, { age: 29 }), version(4, { age: 45 })];
    expect(expiredVersions(versions, { keep: [digest(4)], now: NOW, maxAgeDays: 30 })).toEqual([digest(1), digest(2)]);
  });

  it("keep the version staging and production are running, however old it is", () => {
    // A roll back deploys a digest from months ago; that is exactly the version
    // the host still needs to pull.
    const versions = [version(1, { age: 200 }), version(2, { age: 200 })];
    expect(expiredVersions(versions, { keep: [digest(1), digest(2)], now: NOW, maxAgeDays: 30 })).toEqual([]);
  });

  it("never name a release tag, or the latest tag the staging host follows", () => {
    const versions = [
      version(1, { age: 90, tags: [sha(1), "v2026.06.01-1"] }),
      version(2, { age: 90, tags: [sha(2), "latest"] }),
      version(3, { age: 90, tags: ["latest"] }),
    ];
    expect(expiredVersions(versions, { keep: [], now: NOW, maxAgeDays: 30 })).toEqual([]);
  });

  it("keep any tag that is not a plain commit, even next to one that is", () => {
    const versions = [version(1, { age: 90, tags: [sha(1), "edge"] })];
    expect(expiredVersions(versions, { keep: [], now: NOW, maxAgeDays: 30 })).toEqual([]);
  });

  it("come back oldest first, so the summary reads like a history", () => {
    const versions = [version(3, { age: 40 }), version(1, { age: 90 }), version(2, { age: 60 })];
    expect(expiredVersions(versions, { keep: [], now: NOW, maxAgeDays: 30 })).toEqual([digest(1), digest(2), digest(3)]);
  });

  it("are named when the page of versions arrives as several pages", () => {
    // `gh api --paginate` writes one JSON array per page into one file.
    const pages = [[version(1, { age: 90 })], [version(2, { age: 5 })]];
    expect(expiredVersions(pages, { keep: [], now: NOW, maxAgeDays: 30 })).toEqual([digest(1)]);
  });

  it("are nothing at all when the API answers with something else, so a broken run deletes nothing", () => {
    for (const answer of [null, "not json", { message: "Not Found" }, 42, [{ name: "sha256:x" }]]) {
      expect(expiredVersions(answer, { keep: [], now: NOW, maxAgeDays: 30 })).toEqual([]);
    }
  });

  it("are nothing when a version says when it was created in a way that cannot be read", () => {
    const versions = [{ ...version(1, { age: 90 }), created_at: "yesterday" }];
    expect(expiredVersions(versions, { keep: [], now: NOW, maxAgeDays: 30 })).toEqual([]);
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
