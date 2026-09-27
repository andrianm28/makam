import { describe, expect, it } from "vitest";
import { browserSentryConfig, browserSentryDsn, readPublicSentryEnv } from "@/lib/env";

// One image serves staging and production (ticket 72), so nothing about the
// environment may be baked into it. The browser DSN is read from the running
// server when the browser asks for it, and the environment is read from the host
// the page was served from.
const stagingDsn = "https://stagingkey@glitchtip.makam.co.id/2";
const productionDsn = "https://productionkey@errors.makam.co.id/3";

describe("the browser GlitchTip DSN", () => {
  it("is the one the environment it runs in was started with", () => {
    expect(browserSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: stagingDsn }, "dev.makam.co.id")).toEqual({
      dsn: stagingDsn,
      environment: "staging",
    });
    expect(browserSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: productionDsn }, "makam.co.id")).toEqual({
      dsn: productionDsn,
      environment: "production",
    });
  });

  it("does not carry over from the other environment: the same image, two hosts, two DSNs", () => {
    // The image is the same in both; only the runtime value differs.
    const image = { NEXT_PUBLIC_SENTRY_DSN: stagingDsn };
    expect(browserSentryConfig(image, "makam.co.id")).toEqual({ dsn: stagingDsn, environment: "production" });
  });

  it("is absent when the environment set none, which turns browser reporting off", () => {
    expect(browserSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: "" }, "dev.makam.co.id")).toEqual({
      dsn: undefined,
      environment: "staging",
    });
  });

  it("refuses a DSN that is not a URL rather than reporting to nowhere", () => {
    expect(() => browserSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: "glitchtip" }, "dev.makam.co.id")).toThrow(
      /Invalid environment/,
    );
  });

  it("is read the same way from the page as from the environment", () => {
    expect(readPublicSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: productionDsn })).toEqual({
      NEXT_PUBLIC_SENTRY_DSN: productionDsn,
    });
  });

  it("is what the running server tells the browser, and the build never is", () => {
    // The one image, the one build, two processes: each serves the DSN it was
    // started with. An image is built with no environment at all, so a value
    // frozen into a static page would be empty forever.
    expect(browserSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: stagingDsn })).toBe(stagingDsn);
    expect(browserSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: productionDsn })).toBe(productionDsn);
    expect(browserSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "" })).toBe("");
    expect(browserSentryDsn({})).toBe("");
    expect(() => browserSentryDsn({ NEXT_PUBLIC_SENTRY_DSN: "glitchtip" })).toThrow(/Invalid environment/);
  });
});
