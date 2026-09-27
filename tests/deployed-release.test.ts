import { describe, expect, it } from "vitest";
import { deployedRelease } from "../scripts/migrations/deployed-release";

// Deploys follow signed digests and production lags staging, so the migration
// upgrade test has to start from the newest deployment that actually succeeded
// (production first, then staging), not from a mutable tag. The newest
// deployment of an environment is often a refused or rolled-back attempt, and
// that image is not what anything is running. A host that has never deployed
// simply has no baseline.
const repo = "andrianm28/makam";
const digest = `sha256:${"b".repeat(64)}`;
const deployed = { state: "success", payload: { image_digest: digest } };

describe("the running release of a deployment", () => {
  it("is the digest the host deployed, pinned", () => {
    expect(deployedRelease(deployed, repo)).toBe(`ghcr.io/${repo}@${digest}`);
  });

  it("is nothing when the deployment did not succeed", () => {
    for (const state of ["failure", "error", "in_progress", "pending", "inactive", undefined]) {
      expect(deployedRelease({ state, payload: { image_digest: digest } }, repo)).toBe("");
    }
  });

  it("is nothing when no deployment has been recorded yet", () => {
    expect(deployedRelease({}, repo)).toBe("");
    expect(deployedRelease(null, repo)).toBe("");
    expect(deployedRelease("not json", repo)).toBe("");
  });

  it("is nothing when a successful deployment does not name a digest, or names a tag", () => {
    expect(deployedRelease({ state: "success", payload: { image: "ghcr.io/andrianm28/makam:latest" } }, repo)).toBe("");
    expect(deployedRelease({ state: "success", payload: { image_digest: "latest" } }, repo)).toBe("");
    expect(deployedRelease({ state: "success", payload: { image_digest: `${digest} extra` } }, repo)).toBe("");
  });

  it("is nothing when the payload is the string form GitHub also accepts", () => {
    expect(deployedRelease({ state: "success", payload: JSON.stringify({ image_digest: digest }) }, repo)).toBe("");
  });
});
