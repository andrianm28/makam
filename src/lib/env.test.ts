import { describe, expect, it } from "vitest";
import { readPublicSentryEnv, readRuntimeEnv, readSentryEnv } from "./env";

const DATABASE_URL = "postgres://makam:makam@localhost:5432/makam";

describe("runtime environment", () => {
  it("reads the migrations folder the image sets", () => {
    const env = readRuntimeEnv({ DATABASE_URL, MIGRATIONS_DIR: "/app/drizzle" });
    expect(env.MIGRATIONS_DIR).toBe("/app/drizzle");
  });

  it("leaves the migrations folder unset when empty", () => {
    expect(readRuntimeEnv({ DATABASE_URL, MIGRATIONS_DIR: "" }).MIGRATIONS_DIR).toBeUndefined();
  });
});

describe("error monitoring environment", () => {
  it("needs no database settings, so errors are reported even when those are broken", () => {
    expect(readSentryEnv({ APP_ENV: "staging", SENTRY_DSN: "https://k@glitchtip.makam.co.id/1" })).toEqual({
      APP_ENV: "staging",
      SENTRY_DSN: "https://k@glitchtip.makam.co.id/1",
    });
  });

  it("treats empty values as unset", () => {
    expect(readSentryEnv({ SENTRY_DSN: "", SENTRY_ENVIRONMENT: "", SENTRY_RELEASE: "" })).toEqual({
      APP_ENV: "development",
    });
  });

  it("rejects a DSN that is not a URL", () => {
    expect(() => readSentryEnv({ SENTRY_DSN: "not a url" })).toThrow(/Invalid environment/);
  });
});

describe("browser error monitoring environment (NEXT_PUBLIC_*)", () => {
  it("is disabled and 'development' when nothing was set at build time", () => {
    expect(readPublicSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: "", NEXT_PUBLIC_SENTRY_ENVIRONMENT: undefined })).toEqual({
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "development",
    });
  });

  it("reads the DSN and environment inlined at build time", () => {
    expect(
      readPublicSentryEnv({
        NEXT_PUBLIC_SENTRY_DSN: "https://k@glitchtip.makam.co.id/2",
        NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
      }),
    ).toEqual({
      NEXT_PUBLIC_SENTRY_DSN: "https://k@glitchtip.makam.co.id/2",
      NEXT_PUBLIC_SENTRY_ENVIRONMENT: "production",
    });
  });

  it("rejects a DSN that is not a URL", () => {
    expect(() => readPublicSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: "glitchtip" })).toThrow(/Invalid environment/);
  });
});
