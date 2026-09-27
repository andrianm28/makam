import { describe, expect, it } from "vitest";
import { browserSentryConfig, readPublicSentryEnv } from "@/lib/env";

// One image serves staging and production (ticket 72), so nothing about the
// environment may be baked into it. The browser DSN arrives at runtime, in the
// page, and the environment is read from the host the page was served from.
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
});
