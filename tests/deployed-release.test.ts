import { describe, expect, it } from "vitest";
import { deployedRelease } from "../scripts/migrations/deployed-release";

// Deploys follow signed digests and production lags staging, so the migration
// upgrade test has to start from whatever the newest healthy deployment says is
// running (production first, then staging), not from a mutable tag. A host that
// has never deployed simply has no baseline.
const repo = "andrianm28/makam";
const digest = `sha256:${"b".repeat(64)}`;

describe("the running release of a deployment", () => {
  it("is the digest the host deployed, pinned", () => {
    expect(deployedRelease({ payload: { image_digest: digest } }, repo)).toBe(`ghcr.io/${repo}@${digest}`);
  });

  it("is nothing when no deployment has been recorded yet", () => {
    expect(deployedRelease({}, repo)).toBe("");
    expect(deployedRelease(null, repo)).toBe("");
    expect(deployedRelease("not json", repo)).toBe("");
  });

  it("is nothing when the deployment does not name a digest, or names a tag", () => {
    expect(deployedRelease({ payload: { image: "ghcr.io/andrianm28/makam:latest" } }, repo)).toBe("");
    expect(deployedRelease({ payload: { image_digest: "latest" } }, repo)).toBe("");
    expect(deployedRelease({ payload: { image_digest: `${digest} extra` } }, repo)).toBe("");
  });

  it("is nothing when the payload is the string form GitHub also accepts", () => {
    expect(deployedRelease({ payload: JSON.stringify({ image_digest: digest }) }, repo)).toBe("");
  });
});
