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

  const FAKE_PAYMENT_WEBHOOK_SECRET = "whsec_c2VjcmV0LWZvci10ZXN0cw==";

  it.each(["development", "test"])("keeps the fake payment webhook secret in %s", (APP_ENV) => {
    const env = readRuntimeEnv({ DATABASE_URL, APP_ENV, FAKE_PAYMENT_WEBHOOK_SECRET });
    expect(env.FAKE_PAYMENT_WEBHOOK_SECRET).toBe(FAKE_PAYMENT_WEBHOOK_SECRET);
  });

  it.each(["staging", "production"])("ignores the fake payment webhook secret in %s", (APP_ENV) => {
    const env = readRuntimeEnv({ DATABASE_URL, APP_ENV, FAKE_PAYMENT_WEBHOOK_SECRET, ...LIVE_AUTH });
    expect(env.FAKE_PAYMENT_WEBHOOK_SECRET).toBeUndefined();
  });

  const LIVE_AUTH = { AUTH_SECRET: "s".repeat(32), APP_BASE_URL: "https://makam.co.id" };

  it.each(["staging", "production"])("needs AUTH_SECRET and APP_BASE_URL in %s", (APP_ENV) => {
    expect(() => readRuntimeEnv({ DATABASE_URL, APP_ENV })).toThrow(/AUTH_SECRET[\s\S]*APP_BASE_URL|APP_BASE_URL[\s\S]*AUTH_SECRET/);
    expect(readRuntimeEnv({ DATABASE_URL, APP_ENV, ...LIVE_AUTH })).toMatchObject(LIVE_AUTH);
  });

  it("rejects an AUTH_SECRET shorter than 32 characters", () => {
    expect(() => readRuntimeEnv({ DATABASE_URL, APP_ENV: "production", ...LIVE_AUTH, AUTH_SECRET: "short" })).toThrow(
      /AUTH_SECRET/,
    );
  });

  it.each(["development", "test"])("gives %s a local AUTH_SECRET and APP_BASE_URL when unset", (APP_ENV) => {
    const env = readRuntimeEnv({ DATABASE_URL, APP_ENV, AUTH_SECRET: "", APP_BASE_URL: "" });
    expect(env.AUTH_SECRET.length).toBeGreaterThanOrEqual(32);
    expect(env.APP_BASE_URL).toBe("http://localhost:3000");
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
