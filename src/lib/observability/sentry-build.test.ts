import { describe, expect, it } from "vitest";
import { sentryBuildSettings } from "./sentry-build";

// Source maps and the release are decided when the image is built; the DSN is a
// runtime value (src/lib/env.ts). The build itself must never talk to GlitchTip,
// because a token in the build environment would end up in the image, and it
// must never fall back to sentry.io (ADR 0002 keeps error data in Indonesia).
const commit = "0123456789abcdef0123456789abcdef01234567";

describe("the error-monitoring settings of a build", () => {
  it("generates the source maps and the release, and uploads nothing itself", () => {
    const settings = sentryBuildSettings({ SENTRY_RELEASE: commit });
    expect(settings.productionBrowserSourceMaps).toBe(true);
    expect(settings.sourcemaps.disable).toBe("disable-upload");
    // The maps are what the ci.yml step uploads out of the image; deleting them
    // here would leave that step with nothing to send.
    expect(settings.sourcemaps.deleteSourcemapsAfterUpload).toBe(false);
    expect(settings.release).toEqual({ name: commit });
  });

  it("never sends anything to sentry.io, not even when a token is in the build environment", () => {
    // A token in the build is a mistake (it would live in the image's history);
    // it must not turn into an upload to whatever the SDK's default host is.
    const withToken = sentryBuildSettings({
      SENTRY_AUTH_TOKEN: "not-a-real-token",
      SENTRY_ORG: "makam",
      SENTRY_PROJECT: "makam-staging",
    });
    expect(withToken.sourcemaps.disable).toBe("disable-upload");
    expect(withToken.sentryUrl).toBeUndefined();
    expect(JSON.stringify(withToken)).not.toContain("sentry.io");
  });

  it("names the GlitchTip the app reports to, so nothing is left to a default", () => {
    const settings = sentryBuildSettings({
      SENTRY_URL: "https://errors.makam.co.id",
      SENTRY_ORG: "makam",
      SENTRY_PROJECT: "makam-staging",
    });
    expect(settings.sentryUrl).toBe("https://errors.makam.co.id");
    expect(settings.org).toBe("makam");
    expect(settings.project).toBe("makam-staging");
  });

  it("refuses a GlitchTip URL that is not https, rather than reporting to it or to sentry.io", () => {
    expect(() => sentryBuildSettings({ SENTRY_URL: "http://glitchtip-web:8000" })).toThrow(/Invalid build environment/);
    expect(() => sentryBuildSettings({ SENTRY_URL: "sentry.io" })).toThrow(/Invalid build environment/);
    expect(() => sentryBuildSettings({ SENTRY_URL: "https://localhost:8000" })).toThrow(/Invalid build environment/);
  });

  it("has no release name when the builder set none, so no empty release is created", () => {
    expect(sentryBuildSettings({}).release).toEqual({});
    expect(sentryBuildSettings({ SENTRY_RELEASE: "" }).release).toEqual({});
  });
});
