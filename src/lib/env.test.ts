import { describe, expect, it } from "vitest";
import {
  browserSentryEnvironment,
  readEmailEnv,
  readPublicSentryEnv,
  readRuntimeEnv,
  readSentryEnv,
  showsStagingBanner,
  SUMOPOD_LIVE_BASE_URL,
  SUMOPOD_SANDBOX_BASE_URL,
} from "./env";

const DATABASE_URL = "postgres://makam:makam@localhost:5432/makam";

/** A VAPID key pair (web-push generate-vapid-keys), for staging and production cases. */
const VAPID = {
  VAPID_PUBLIC_KEY: "BI9GUoKHw9z_J777Fi5TjIhzfL2qIT1Mwt43yL-4ClEIJe4nqMPuqV6N4fhPf0H0HElivGiE4yiJ63gf5uyry40",
  VAPID_PRIVATE_KEY: "Xpgeqwz12bqNco2x4H5dpW57Hqrr1zVY6ift2jx5YYc",
  VAPID_SUBJECT: "mailto:ops@makam.co.id",
};

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

  const TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
  const LIVE_SMTP = { SMTP_USER: "v1-user", SMTP_PASSWORD: "v1-password", EMAIL_FROM: "no-reply@makam.co.id" };
  const LIVE_SUMOPOD = { SUMOPOD_API_KEY: "sumopod-key", SUMOPOD_WEBHOOK_SECRET: "whsec_c3Vtb3BvZC10ZXN0LXNlY3JldA==" };
  const AUTH = { AUTH_SECRET: "s".repeat(32), APP_BASE_URL: "https://makam.co.id", TOTP_ENCRYPTION_KEY };
  const LIVE_AUTH = { ...AUTH, ...LIVE_SMTP, ...LIVE_SUMOPOD, ...VAPID };

  it.each(["staging", "production"])("needs the VAPID key pair and subject for web push in %s", (APP_ENV) => {
    for (const key of ["VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT"] as const) {
      expect(() => readRuntimeEnv({ DATABASE_URL, APP_ENV, ...LIVE_AUTH, [key]: "" })).toThrow(
        new RegExp(`${key} is required`),
      );
    }
    expect(readRuntimeEnv({ DATABASE_URL, APP_ENV, ...LIVE_AUTH }).vapid).toEqual({
      publicKey: VAPID.VAPID_PUBLIC_KEY,
      privateKey: VAPID.VAPID_PRIVATE_KEY,
      subject: VAPID.VAPID_SUBJECT,
    });
  });

  it("rejects VAPID keys that are not a P-256 key pair in base64url", () => {
    const live = { DATABASE_URL, APP_ENV: "production", ...LIVE_AUTH };
    expect(() => readRuntimeEnv({ ...live, VAPID_PUBLIC_KEY: VAPID.VAPID_PRIVATE_KEY })).toThrow(/VAPID_PUBLIC_KEY/);
    expect(() => readRuntimeEnv({ ...live, VAPID_PRIVATE_KEY: VAPID.VAPID_PUBLIC_KEY })).toThrow(/VAPID_PRIVATE_KEY/);
    expect(() => readRuntimeEnv({ ...live, VAPID_PRIVATE_KEY: "not+base64url/" })).toThrow(/VAPID_PRIVATE_KEY/);
  });

  it("needs a VAPID subject that push services accept: a mailto: or an https URL, never localhost", () => {
    const live = { DATABASE_URL, APP_ENV: "production", ...LIVE_AUTH };
    expect(readRuntimeEnv({ ...live, VAPID_SUBJECT: "https://makam.co.id" }).vapid.subject).toBe("https://makam.co.id");
    expect(() => readRuntimeEnv({ ...live, VAPID_SUBJECT: "ops@makam.co.id" })).toThrow(/VAPID_SUBJECT/);
    expect(() => readRuntimeEnv({ ...live, VAPID_SUBJECT: "http://makam.co.id" })).toThrow(/VAPID_SUBJECT/);
    expect(() => readRuntimeEnv({ ...live, VAPID_SUBJECT: "https://localhost" })).toThrow(/VAPID_SUBJECT/);
  });

  it.each(["development", "test"])("gives %s a fixed local VAPID key pair and subject when unset", (APP_ENV) => {
    const env = readRuntimeEnv({ DATABASE_URL, APP_ENV, VAPID_PUBLIC_KEY: "", VAPID_PRIVATE_KEY: "", VAPID_SUBJECT: "" });
    expect(Buffer.from(env.vapid.publicKey, "base64url")).toHaveLength(65);
    expect(Buffer.from(env.vapid.privateKey, "base64url")).toHaveLength(32);
    expect(env.vapid.subject).toMatch(/^mailto:/);
    expect(readRuntimeEnv({ DATABASE_URL, APP_ENV }).vapid).toEqual(env.vapid);
  });

  it.each(["staging", "production"])("needs TOTP_ENCRYPTION_KEY in %s", (APP_ENV) => {
    expect(() => readRuntimeEnv({ DATABASE_URL, APP_ENV, ...LIVE_AUTH, TOTP_ENCRYPTION_KEY: "" })).toThrow(
      /TOTP_ENCRYPTION_KEY is required/,
    );
  });

  it("rejects a TOTP_ENCRYPTION_KEY that is not 32 bytes in base64", () => {
    const sixteenBytes = Buffer.alloc(16, 1).toString("base64");
    expect(() =>
      readRuntimeEnv({ DATABASE_URL, APP_ENV: "production", ...LIVE_AUTH, TOTP_ENCRYPTION_KEY: sixteenBytes }),
    ).toThrow(/TOTP_ENCRYPTION_KEY/);
    expect(() =>
      readRuntimeEnv({ DATABASE_URL, APP_ENV: "production", ...LIVE_AUTH, TOTP_ENCRYPTION_KEY: "not base64!" }),
    ).toThrow(/TOTP_ENCRYPTION_KEY/);
  });

  it.each(["development", "test"])("gives %s a local 32-byte TOTP_ENCRYPTION_KEY when unset", (APP_ENV) => {
    const env = readRuntimeEnv({ DATABASE_URL, APP_ENV, TOTP_ENCRYPTION_KEY: "" });
    expect(Buffer.from(env.TOTP_ENCRYPTION_KEY, "base64")).toHaveLength(32);
  });

  it.each(["staging", "production"])("needs AUTH_SECRET and APP_BASE_URL in %s", (APP_ENV) => {
    expect(() => readRuntimeEnv({ DATABASE_URL, APP_ENV })).toThrow(/AUTH_SECRET[\s\S]*APP_BASE_URL|APP_BASE_URL[\s\S]*AUTH_SECRET/);
    expect(readRuntimeEnv({ DATABASE_URL, APP_ENV, ...LIVE_AUTH })).toMatchObject(AUTH);
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

describe("PdfRenderer environment", () => {
  it("renders with the image's chromium-headless-shell, opening document pages on the web server itself, by default", () => {
    const env = readRuntimeEnv({ DATABASE_URL });
    expect(env.CHROMIUM_PATH).toBe("/usr/bin/chromium-headless-shell");
    expect(env.documentPageOrigin).toBe("http://127.0.0.1:3000");
  });

  it("follows the web server's PORT, or an explicit DOCUMENT_PAGE_ORIGIN and CHROMIUM_PATH", () => {
    expect(readRuntimeEnv({ DATABASE_URL, PORT: "3310" }).documentPageOrigin).toBe("http://127.0.0.1:3310");
    const env = readRuntimeEnv({ DATABASE_URL, DOCUMENT_PAGE_ORIGIN: "http://web:3000/", CHROMIUM_PATH: "/usr/bin/chromium" });
    expect(env.documentPageOrigin).toBe("http://web:3000");
    expect(env.CHROMIUM_PATH).toBe("/usr/bin/chromium");
  });

  it("refuses a relative CHROMIUM_PATH and a DOCUMENT_PAGE_ORIGIN that is no http(s) origin", () => {
    expect(() => readRuntimeEnv({ DATABASE_URL, CHROMIUM_PATH: "chromium" })).toThrow(/CHROMIUM_PATH/);
    expect(() => readRuntimeEnv({ DATABASE_URL, DOCUMENT_PAGE_ORIGIN: "file:///tmp" })).toThrow(/DOCUMENT_PAGE_ORIGIN/);
  });
});

describe("EmailSender environment (SumoPod SMTP relay)", () => {
  const LIVE_SMTP = { SMTP_USER: "v1-user", SMTP_PASSWORD: "v1-password", EMAIL_FROM: "no-reply@makam.co.id" };

  it.each(["staging", "production"])("needs SMTP_USER, SMTP_PASSWORD and EMAIL_FROM in %s", (APP_ENV) => {
    for (const missing of ["SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const) {
      expect(() => readEmailEnv({ APP_ENV, ...LIVE_SMTP, [missing]: "" })).toThrow(
        new RegExp(`${missing} is required in ${APP_ENV}`),
      );
    }
  });

  it("defaults to smtp.sumopod.com on port 465 with the display name Makam.co.id", () => {
    expect(readEmailEnv({ APP_ENV: "production", ...LIVE_SMTP }).smtp).toEqual({
      host: "smtp.sumopod.com",
      port: 465,
      user: "v1-user",
      password: "v1-password",
      from: { address: "no-reply@makam.co.id", name: "Makam.co.id" },
    });
  });

  it("reads an explicit host, port and display name", () => {
    const env = readEmailEnv({
      APP_ENV: "staging",
      ...LIVE_SMTP,
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "2465",
      EMAIL_FROM_NAME: "Makam.co.id (staging)",
    });
    expect(env.smtp).toMatchObject({
      host: "smtp.example.test",
      port: 2465,
      from: { address: "no-reply@makam.co.id", name: "Makam.co.id (staging)" },
    });
  });

  it("rejects an EMAIL_FROM that is not an email address", () => {
    expect(() => readEmailEnv({ APP_ENV: "production", ...LIVE_SMTP, EMAIL_FROM: "Makam.co.id" })).toThrow(/EMAIL_FROM/);
  });

  it.each(["development", "test"])("needs no SMTP settings in %s, where the fake EmailSender is used", (APP_ENV) => {
    expect(readEmailEnv({ APP_ENV }).smtp).toBeUndefined();
    expect(readRuntimeEnv({ DATABASE_URL, APP_ENV }).smtp).toBeUndefined();
  });

  it("carries the SMTP settings into the runtime environment", () => {
    const env = readRuntimeEnv({
      DATABASE_URL,
      APP_ENV: "production",
      AUTH_SECRET: "s".repeat(32),
      APP_BASE_URL: "https://makam.co.id",
      TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
      ...VAPID,
      ...LIVE_SMTP,
      SUMOPOD_API_KEY: "sumopod-key",
      SUMOPOD_WEBHOOK_SECRET: "whsec_c3Vtb3BvZC10ZXN0LXNlY3JldA==",
    });
    expect(env.smtp).toMatchObject({ user: "v1-user", from: { address: "no-reply@makam.co.id" } });
  });

  it("never puts the SMTP password in a validation error", () => {
    expect(() => readEmailEnv({ APP_ENV: "production", ...LIVE_SMTP, SMTP_PORT: "not-a-port" })).toThrow(
      expect.objectContaining({ message: expect.not.stringContaining("v1-password") }),
    );
  });
});

describe("PaymentProvider environment (SumoPod)", () => {
  const LIVE_SMTP = { SMTP_USER: "v1-user", SMTP_PASSWORD: "v1-password", EMAIL_FROM: "no-reply@makam.co.id" };
  const LIVE_SUMOPOD = { SUMOPOD_API_KEY: "sumopod-key", SUMOPOD_WEBHOOK_SECRET: "whsec_c3Vtb3BvZC10ZXN0LXNlY3JldA==" };
  const auth = (APP_ENV: string) => ({
    DATABASE_URL,
    APP_ENV,
    AUTH_SECRET: "s".repeat(32),
    APP_BASE_URL: "https://makam.co.id",
    TOTP_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64"),
    ...VAPID,
    ...LIVE_SMTP,
  });

  it.each(["staging", "production"])("needs SUMOPOD_API_KEY and SUMOPOD_WEBHOOK_SECRET in %s", (APP_ENV) => {
    for (const missing of ["SUMOPOD_API_KEY", "SUMOPOD_WEBHOOK_SECRET"] as const) {
      expect(() => readRuntimeEnv({ ...auth(APP_ENV), ...LIVE_SUMOPOD, [missing]: "" })).toThrow(
        new RegExp(`${missing} is required in ${APP_ENV}`),
      );
    }
  });

  it("rejects a webhook secret that does not start with whsec_", () => {
    expect(() =>
      readRuntimeEnv({ ...auth("production"), ...LIVE_SUMOPOD, SUMOPOD_WEBHOOK_SECRET: "not-a-svix-secret" }),
    ).toThrow(/SUMOPOD_WEBHOOK_SECRET/);
  });

  it("defaults the base URL to the sandbox host in staging and the live host in production", () => {
    expect(readRuntimeEnv({ ...auth("staging"), ...LIVE_SUMOPOD }).sumopod).toEqual({
      apiKey: "sumopod-key",
      webhookSecret: LIVE_SUMOPOD.SUMOPOD_WEBHOOK_SECRET,
      baseUrl: SUMOPOD_SANDBOX_BASE_URL,
    });
    expect(readRuntimeEnv({ ...auth("production"), ...LIVE_SUMOPOD }).sumopod).toMatchObject({
      baseUrl: SUMOPOD_LIVE_BASE_URL,
    });
  });

  it("an explicit SUMOPOD_BASE_URL overrides the per-environment default", () => {
    const env = readRuntimeEnv({ ...auth("staging"), ...LIVE_SUMOPOD, SUMOPOD_BASE_URL: "https://sumopod.example.test" });
    expect(env.sumopod?.baseUrl).toBe("https://sumopod.example.test");
  });

  it.each(["development", "test"])("needs no SumoPod settings in %s, where the fake PaymentProvider is used", (APP_ENV) => {
    expect(readRuntimeEnv({ DATABASE_URL, APP_ENV }).sumopod).toBeUndefined();
  });

  it("never puts the API key or webhook secret in a validation error", () => {
    expect(() =>
      readRuntimeEnv({ ...auth("production"), ...LIVE_SUMOPOD, SUMOPOD_BASE_URL: "not-a-url" }),
    ).toThrow(expect.objectContaining({ message: expect.not.stringContaining("sumopod-key") }));
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

describe("browser error monitoring DSN (NEXT_PUBLIC_*)", () => {
  it("is disabled when no DSN was set at build time", () => {
    expect(readPublicSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: "" })).toEqual({});
  });

  it("reads the DSN inlined at build time", () => {
    expect(readPublicSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: "https://k@glitchtip.makam.co.id/2" })).toEqual({
      NEXT_PUBLIC_SENTRY_DSN: "https://k@glitchtip.makam.co.id/2",
    });
  });

  it("rejects a DSN that is not a URL", () => {
    expect(() => readPublicSentryEnv({ NEXT_PUBLIC_SENTRY_DSN: "glitchtip" })).toThrow(/Invalid environment/);
  });
});

describe("browser error monitoring environment (from the page's host, since one image serves staging and production)", () => {
  it.each([
    ["dev.makam.co.id", "staging"],
    ["makam.co.id", "production"],
    ["www.makam.co.id", "production"],
    ["MAKAM.CO.ID", "production"],
    ["localhost", "development"],
    ["127.0.0.1", "development"],
    ["beta.makam.co.id", "development"],
    ["makam.co.id.evil.example", "development"],
    ["", "development"],
  ])("%s is %s", (hostname, environment) => {
    expect(browserSentryEnvironment(hostname)).toBe(environment);
  });
});

describe("staging banner (from the page's host, since statically rendered pages can't read the runtime environment)", () => {
  it.each([
    ["dev.makam.co.id", true],
    ["DEV.MAKAM.CO.ID", true],
    ["makam.co.id", false],
    ["www.makam.co.id", false],
    ["localhost", false],
    ["127.0.0.1", false],
    ["beta.makam.co.id", false],
    ["dev.makam.co.id.evil.example", false],
    ["", false],
  ])("on %s the banner shows: %s", (hostname, shown) => {
    expect(showsStagingBanner(hostname)).toBe(shown);
  });
});
