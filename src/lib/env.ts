import { z } from "zod";
import { base64urlBytes } from "./base64url";

/**
 * Where the app is running. It decides which adapters the composition root
 * wires: `development` and `test` use in-memory fakes for the outbound ports;
 * `staging` and `production` use live adapters only (staging with sandbox
 * credentials, e.g. SumoPod sandbox), never a fake.
 */
export const appEnvironments = ["development", "test", "staging", "production"] as const;
export type AppEnvironment = (typeof appEnvironments)[number];

/** True only where the in-memory fakes may stand in for outside services. */
export function usesInMemoryFakes(appEnv: AppEnvironment): boolean {
  return appEnv === "development" || appEnv === "test";
}

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

/**
 * The release this environment has opened (`RILIS_TERBUKA`, 1 to 3). Unset, development,
 * test and staging open everything and every other value of APP_ENV (production,
 * missing, unknown) opens Rilis 1, so a missing setting can never open more on
 * production than the release plan allows.
 */
const rilisEnvSchema = z
  .object({
    // Any string: an unknown or missing APP_ENV must not throw, it must fail closed to Rilis 1.
    APP_ENV: z.preprocess(emptyToUndefined, z.string().optional()),
    RILIS_TERBUKA: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(3).optional()),
  })
  .transform(({ APP_ENV, RILIS_TERBUKA }): 1 | 2 | 3 => {
    if (RILIS_TERBUKA !== undefined) return RILIS_TERBUKA as 1 | 2 | 3;
    // Only the environments that run fakes or sandboxes open everything by default; anything else (production, unset, unknown) opens Rilis 1.
    return APP_ENV === "development" || APP_ENV === "test" || APP_ENV === "staging" ? 3 : 1;
  });

/** Where the image installs its headless Chromium (Debian's chromium-headless-shell), for the live PdfRenderer. */
export const DEFAULT_CHROMIUM_PATH = "/usr/bin/chromium-headless-shell";

/**
 * Where the private FileStore volume is mounted (docker-compose.prod.yml: a
 * makam-only Docker volume, never served by nginx or Next's static handler).
 * ADR 0002 (beta UAT amendment): a host-disk FileStore stands in for AWS S3
 * (planned for v2) behind the same port.
 */
export const DEFAULT_FILES_ROOT = "/data/files";

type EnvSource = Record<string, string | undefined>;

/** Error monitoring (Sentry SDK to GlitchTip). Needs nothing else, so it works even when the rest is misconfigured. */
const sentryEnvSchema = z.object({
  APP_ENV: z.enum(appEnvironments).default("development"),
  SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  SENTRY_RELEASE: z.preprocess(emptyToUndefined, z.string().optional()),
});

/** Development and test only (staging and production must set their own; see superRefine below). */
const LOCAL_AUTH_SECRET = "makam-local-development-secret-not-for-staging-or-production";
const LOCAL_BASE_URL = "http://localhost:3000";
/** A fixed 32-byte key, base64: development and test only. */
const LOCAL_TOTP_ENCRYPTION_KEY = Buffer.alloc(32, 0x6d).toString("base64");

/** Exactly 32 bytes (an AES-256 key), written in standard base64 (`openssl rand -base64 32`). */
const base64Key32 = z
  .string()
  .regex(/^[A-Za-z0-9+/]+={0,2}$/, "must be base64")
  .refine((value) => Buffer.from(value, "base64").length === 32, "must decode to 32 bytes");

/**
 * A fixed VAPID key pair and subject: development and test only, where the
 * fake WebPush sends nothing (generated once with `web-push generate-vapid-keys`).
 */
const LOCAL_VAPID_PUBLIC_KEY = "BC_qW4wXMGMGnjLWnznxcJ2eJgsuIZyje3y3GNBPPKosK2tmyeodvkIhHVN07eedoLz2-3raxt5x9ftthpdz5oI";
const LOCAL_VAPID_PRIVATE_KEY = "_ePH1MZPQEBgQ9idRe19cAhO6_v7NU8maCcgKgB1fOs";
const LOCAL_VAPID_SUBJECT = "mailto:dev@makam.co.id";

/** A P-256 public key, uncompressed (65 bytes, first byte 0x04), unpadded base64url. */
const vapidPublicKey = base64urlBytes(65, "must be an uncompressed P-256 public key (65 bytes)").refine(
  (value) => Buffer.from(value, "base64url")[0] === 0x04,
  "must be an uncompressed P-256 public key (65 bytes)",
);

/** A P-256 private key (32 bytes), unpadded base64url. */
const vapidPrivateKey = base64urlBytes(32, "must be a P-256 private key (32 bytes)");

/** The VAPID key pair and subject that sign web push to staff (RFC 8292). */
export interface VapidKeys {
  /** VAPID_PUBLIC_KEY: P-256, uncompressed, unpadded base64url; browsers subscribe with it. */
  publicKey: string;
  /** VAPID_PRIVATE_KEY: its private half (32 bytes, unpadded base64url). */
  privateKey: string;
  /** VAPID_SUBJECT: the mailto: or https contact push services see. */
  subject: string;
}

/** Push services want a contact: `mailto:` or an https URL; Apple refuses localhost subjects. */
const vapidSubject = z.string().refine(
  (value) =>
    /^mailto:[^@\s]+@[^@\s]+$/.test(value) ||
    (value.startsWith("https://") && URL.canParse(value) && new URL(value).hostname !== "localhost"),
  "must be mailto:<email> or an https URL (not localhost)",
);

const vapidKeys = (keys: VapidKeys): VapidKeys => keys;

/** Settings staging and production must set; development and test fall back to local values. */
const liveRequired = [
  "AUTH_SECRET",
  "APP_BASE_URL",
  "TOTP_ENCRYPTION_KEY",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
] as const;

/**
 * The EmailSender's SumoPod SMTP relay (ticket 68, ADR 0002 amendment): implicit
 * TLS on 465. Required in staging and production; development and test use the
 * fake EmailSender and need none of it.
 */
const smtpEnvShape = {
  SMTP_HOST: z.preprocess(emptyToUndefined, z.string().min(1).default("smtp.sumopod.com")),
  SMTP_PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(465)),
  SMTP_USER: z.preprocess(emptyToUndefined, z.string().optional()),
  SMTP_PASSWORD: z.preprocess(emptyToUndefined, z.string().optional()),
  /** The sender address, e.g. no-reply@makam.co.id. */
  EMAIL_FROM: z.preprocess(emptyToUndefined, z.email().optional()),
  EMAIL_FROM_NAME: z.preprocess(emptyToUndefined, z.string().default("Makam.co.id")),
};

const SMTP_REQUIRED = ["SMTP_USER", "SMTP_PASSWORD", "EMAIL_FROM"] as const;

/** Where and as whom the live EmailSender sends. */
export interface SmtpSettings {
  host: string;
  port: number;
  user: string;
  password: string;
  from: { address: string; name: string };
}

interface SmtpEnvFields {
  APP_ENV: AppEnvironment;
  SMTP_HOST: string;
  SMTP_PORT: number;
  SMTP_USER?: string;
  SMTP_PASSWORD?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME: string;
}

function requireSmtpOutsideFakes(env: SmtpEnvFields, ctx: z.RefinementCtx) {
  if (usesInMemoryFakes(env.APP_ENV)) return;
  for (const key of SMTP_REQUIRED) {
    if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in ${env.APP_ENV}` });
  }
}

/** Folds the SMTP_* / EMAIL_* variables into one `smtp` value; undefined unless all of them are set. */
function withSmtpSettings<E extends SmtpEnvFields>(env: E) {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, EMAIL_FROM, EMAIL_FROM_NAME, ...rest } = env;
  const smtp: SmtpSettings | undefined =
    SMTP_USER && SMTP_PASSWORD && EMAIL_FROM
      ? {
          host: SMTP_HOST,
          port: SMTP_PORT,
          user: SMTP_USER,
          password: SMTP_PASSWORD,
          from: { address: EMAIL_FROM, name: EMAIL_FROM_NAME },
        }
      : undefined;
  return { ...rest, smtp };
}

/** Only the EmailSender settings, for the `email-check` CLI (needs no database). */
const emailEnvSchema = z
  .object({ APP_ENV: z.enum(appEnvironments).default("development"), ...smtpEnvShape })
  .superRefine(requireSmtpOutsideFakes)
  .transform(withSmtpSettings);

/** SumoPod's Managed Payment sandbox host: v1's beta UAT runs on it (staging, ticket 61, decided 2026-09-26). */
export const SUMOPOD_SANDBOX_BASE_URL = "https://api-pay-sandbox.sumopod.com";
/** SumoPod's Managed Payment live host, installed with live keys on the switch day (ticket 07). */
export const SUMOPOD_LIVE_BASE_URL = "https://api-pay.sumopod.com";

/**
 * The live PaymentProvider (SumoPod), by env (ticket 61). Required in staging
 * and production, where staging holds sandbox keys (`SUMOPOD_API_KEY`,
 * `SUMOPOD_WEBHOOK_SECRET`) and production holds live ones, installed on the
 * switch day (ticket 07). Development and test always use the fake and need
 * none of it.
 */
const sumopodEnvShape = {
  /** The SumoPod project's X-Api-Key. */
  SUMOPOD_API_KEY: z.preprocess(emptyToUndefined, z.string().min(1).optional()),
  /** The SumoPod project's Svix signing secret. */
  SUMOPOD_WEBHOOK_SECRET: z.preprocess(emptyToUndefined, z.string().startsWith("whsec_").optional()),
  /**
   * Override for the Managed Payment API base URL. Left unset, staging uses
   * the sandbox host and production the live host; ticket 07 need not set
   * this at all for the switch to live keys.
   */
  SUMOPOD_BASE_URL: z.preprocess(emptyToUndefined, z.url({ protocol: /^https$/ }).optional()),
};

const SUMOPOD_REQUIRED = ["SUMOPOD_API_KEY", "SUMOPOD_WEBHOOK_SECRET"] as const;

/** The SumoPod project the live PaymentProvider calls and verifies webhooks against. */
export interface SumopodSettings {
  apiKey: string;
  webhookSecret: string;
  baseUrl: string;
}

interface SumopodEnvFields {
  APP_ENV: AppEnvironment;
  SUMOPOD_API_KEY?: string;
  SUMOPOD_WEBHOOK_SECRET?: string;
  SUMOPOD_BASE_URL?: string;
}

function requireSumopodOutsideFakes(env: SumopodEnvFields, ctx: z.RefinementCtx) {
  if (usesInMemoryFakes(env.APP_ENV)) return;
  for (const key of SUMOPOD_REQUIRED) {
    if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in ${env.APP_ENV}` });
  }
}

/** Folds the SUMOPOD_* variables into one `sumopod` value; undefined unless the key and secret are both set. */
function withSumopodSettings<E extends SumopodEnvFields>(env: E) {
  const { SUMOPOD_API_KEY, SUMOPOD_WEBHOOK_SECRET, SUMOPOD_BASE_URL, ...rest } = env;
  const sumopod: SumopodSettings | undefined =
    SUMOPOD_API_KEY && SUMOPOD_WEBHOOK_SECRET
      ? {
          apiKey: SUMOPOD_API_KEY,
          webhookSecret: SUMOPOD_WEBHOOK_SECRET,
          baseUrl: SUMOPOD_BASE_URL ?? (env.APP_ENV === "production" ? SUMOPOD_LIVE_BASE_URL : SUMOPOD_SANDBOX_BASE_URL),
        }
      : undefined;
  return { ...rest, sumopod };
}

const runtimeEnvSchema = sentryEnvSchema.extend({
  ...smtpEnvShape,
  ...sumopodEnvShape,
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** The release this environment has opened, 1 to 3 (ADR 0006); validated here so a bad value stops the process at start. */
  RILIS_TERBUKA: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(3).optional()),
  /** Where the Drizzle migrations live (the image sets /app/drizzle); default ./drizzle. */
  MIGRATIONS_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  /**
   * Svix signing secret the fake PaymentProvider signs its webhooks with.
   * Development and test only: dropped in staging and production.
   */
  FAKE_PAYMENT_WEBHOOK_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().startsWith("whsec_").optional(),
  ),
  /** Signs session cookies and keys OTP hashes. Required outside development and test. */
  AUTH_SECRET: z.preprocess(emptyToUndefined, z.string().min(32).optional()),
  /** The site's own origin, e.g. https://makam.co.id. Required outside development and test. */
  APP_BASE_URL: z.preprocess(emptyToUndefined, z.url({ protocol: /^https?$/ }).optional()),
  /** Encrypts Admin Platform TOTP secrets at rest (AES-256-GCM). Required outside development and test. */
  TOTP_ENCRYPTION_KEY: z.preprocess(emptyToUndefined, base64Key32.optional()),
  /** Web push (VAPID, RFC 8292): the key pair and contact that sign staff pushes. Required outside development and test. */
  VAPID_PUBLIC_KEY: z.preprocess(emptyToUndefined, vapidPublicKey.optional()),
  VAPID_PRIVATE_KEY: z.preprocess(emptyToUndefined, vapidPrivateKey.optional()),
  VAPID_SUBJECT: z.preprocess(emptyToUndefined, vapidSubject.optional()),
  /** The headless Chromium the live PdfRenderer runs; the image installs Debian's chromium-headless-shell here. */
  CHROMIUM_PATH: z.preprocess(emptyToUndefined, z.string().startsWith("/", "must be an absolute path").default(DEFAULT_CHROMIUM_PATH)),
  /** Where the live FileStore (host disk, ticket 60) reads and writes; the private volume's mount point. Development and test use the in-memory fake and never touch disk. */
  FILES_ROOT: z.preprocess(emptyToUndefined, z.string().startsWith("/", "must be an absolute path").default(DEFAULT_FILES_ROOT)),
  /**
   * Development only, opt-in: keep the FileStore on this directory of the local
   * disk instead of in memory, so files a seed CLI stores (Lokasi photos) are
   * served by the dev web server, which is another process. Refused outside
   * development; unset keeps the in-memory fake.
   */
  DEV_FILES_ROOT: z.preprocess(emptyToUndefined, z.string().startsWith("/", "must be an absolute path").optional()),
  /** The port the web server listens on (the image sets 3000). */
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(3000)),
  /**
   * Where the PdfRenderer opens document pages ("Unduh PDF"): an origin that
   * reaches the web server from inside its container. Default http://127.0.0.1:$PORT.
   */
  DOCUMENT_PAGE_ORIGIN: z.preprocess(emptyToUndefined, z.url({ protocol: /^https?$/ }).optional()),
})
  .superRefine((env, ctx) => {
    requireSmtpOutsideFakes(env, ctx);
    requireSumopodOutsideFakes(env, ctx);
    if (env.DEV_FILES_ROOT && env.APP_ENV !== "development") {
      ctx.addIssue({ code: "custom", path: ["DEV_FILES_ROOT"], message: `DEV_FILES_ROOT is for development only, not ${env.APP_ENV}` });
    }
    if (usesInMemoryFakes(env.APP_ENV)) return;
    for (const key of liveRequired) {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in ${env.APP_ENV}` });
    }
  })
  .transform(
    ({
      FAKE_PAYMENT_WEBHOOK_SECRET,
      AUTH_SECRET,
      APP_BASE_URL,
      TOTP_ENCRYPTION_KEY,
      VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY,
      VAPID_SUBJECT,
      DOCUMENT_PAGE_ORIGIN,
      ...env
    }) => ({
      ...withSumopodSettings(withSmtpSettings(env)),
      documentPageOrigin: new URL(DOCUMENT_PAGE_ORIGIN ?? `http://127.0.0.1:${env.PORT}`).origin,
      // Required (and so set) in staging and production; the fixed local pair only where fakes run.
      vapid: vapidKeys({
        publicKey: VAPID_PUBLIC_KEY ?? LOCAL_VAPID_PUBLIC_KEY,
        privateKey: VAPID_PRIVATE_KEY ?? LOCAL_VAPID_PRIVATE_KEY,
        subject: VAPID_SUBJECT ?? LOCAL_VAPID_SUBJECT,
      }),
      FAKE_PAYMENT_WEBHOOK_SECRET: usesInMemoryFakes(env.APP_ENV) ? FAKE_PAYMENT_WEBHOOK_SECRET : undefined,
      AUTH_SECRET: AUTH_SECRET ?? LOCAL_AUTH_SECRET,
      APP_BASE_URL: APP_BASE_URL ?? LOCAL_BASE_URL,
      TOTP_ENCRYPTION_KEY: TOTP_ENCRYPTION_KEY ?? LOCAL_TOTP_ENCRYPTION_KEY,
    }),
  );

/**
 * Browser error monitoring. The DSN is a runtime value, fetched by the browser
 * from the server that is running (one image serves staging and production), so
 * the caller passes the value the running process was started with. The
 * environment is not a value at all: the browser takes it from the page's host
 * (`browserSentryEnvironment`).
 */
const publicSentryEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
});

/** What the browser Sentry client needs: the DSN of the environment it runs in, and its name. */
export interface BrowserSentryConfig {
  dsn: string | undefined;
  environment: AppEnvironment;
}

/**
 * The browser Sentry configuration for the page being served right now: the DSN
 * the running environment was started with, and the environment taken from the
 * page's host. An unset DSN leaves browser reporting off.
 */
export function browserSentryConfig(runtime: { NEXT_PUBLIC_SENTRY_DSN?: string }, hostname: string): BrowserSentryConfig {
  return {
    dsn: readPublicSentryEnv(runtime).NEXT_PUBLIC_SENTRY_DSN,
    environment: browserSentryEnvironment(hostname),
  };
}

/**
 * The GlitchTip DSN the browser needs, read from the environment **this process
 * was started with**, never from the build.
 *
 * It cannot be inlined into a page: the home page is statically rendered, so a
 * value read while building would be frozen into that HTML and stay the build's
 * (an empty string, because the image is built with no environment at all). The
 * browser fetches it from `/api/browser-config` instead, which runs per request.
 * The DSN is public by design, so the browser may hold it.
 */
export function browserSentryDsn(source: EnvSource = process.env): string {
  return readPublicSentryEnv(source).NEXT_PUBLIC_SENTRY_DSN ?? "";
}

const browserEnvironmentByHost: Record<string, AppEnvironment> = {
  "dev.makam.co.id": "staging",
  "makam.co.id": "production",
  "www.makam.co.id": "production",
};

/** The Sentry environment for browser events, from `window.location.hostname`. Unknown hosts are `development`. */
export function browserSentryEnvironment(hostname: string): AppEnvironment {
  return browserEnvironmentByHost[hostname.toLowerCase()] ?? "development";
}

/** Whether the page on this host shows the staging banner: only where the host maps to `staging`. */
export function showsStagingBanner(hostname: string): boolean {
  return browserSentryEnvironment(hostname) === "staging";
}

/**
 * Whether payments are a trial right now (ticket 101): production whose SumoPod
 * base-URL override points at the sandbox host, until the live merchant account
 * and keys exist. Staging (its own banner), development and test never are; a
 * production on the live host, or with no override, is not. Reads the process
 * environment at request time, never the build's, and never throws: a bad
 * setting reads as "not a trial" (the runtime env check stops a bad process).
 */
export function paymentsAreTrial(source: EnvSource = process.env): boolean {
  if (source.APP_ENV !== "production") return false;
  const override = source.SUMOPOD_BASE_URL;
  if (!override || !URL.canParse(override)) return false;
  return new URL(override).host === new URL(SUMOPOD_SANDBOX_BASE_URL).host;
}

/**
 * Whether the prices a page shows may still be example prices, "harga contoh" (the beta, ticket 112): every
 * environment but a production that pays live. Staging, development and test hold example data by nature, and
 * production does while its payments are a trial (`paymentsAreTrial`). A missing or unknown `APP_ENV` reads as
 * "may be examples", never as live, so a misread can only add a label and never hide one.
 */
export function pricesMayBeExamples(source: EnvSource = process.env): boolean {
  return source.APP_ENV !== "production" || paymentsAreTrial(source);
}

export type SentryEnv = z.infer<typeof sentryEnvSchema>;
export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;
export type EmailEnv = z.infer<typeof emailEnvSchema>;
export type PublicSentryEnv =z.infer<typeof publicSentryEnvSchema>;

function parseEnv<S extends z.ZodType>(schema: S, source: EnvSource): z.infer<S> {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

/** Reads and validates the server-side environment. Throws on a bad value. */
export function readRuntimeEnv(source: EnvSource = process.env): RuntimeEnv {
  return parseEnv(runtimeEnvSchema, source);
}

/** The release number this environment has opened (ADR 0006). Throws on a bad value. */
export function readRilisEnv(source: EnvSource = process.env): 1 | 2 | 3 {
  // Parsed once per distinct pair of settings, not on every request.
  const key = `${source.APP_ENV ?? ""}|${source.RILIS_TERBUKA ?? ""}`;
  let known = rilisCache.get(key);
  if (known === undefined) {
    known = parseEnv(rilisEnvSchema, source);
    rilisCache.set(key, known);
  }
  return known;
}

const rilisCache = new Map<string, 1 | 2 | 3>();

/** Reads and validates only the error-monitoring settings (web server Sentry). */
export function readSentryEnv(source: EnvSource = process.env): SentryEnv {
  return parseEnv(sentryEnvSchema, source);
}

/** Reads and validates only the EmailSender settings (the `email-check` CLI). */
export function readEmailEnv(source: EnvSource = process.env): EmailEnv {
  return parseEnv(emailEnvSchema, source);
}

/** Validates the NEXT_PUBLIC_* error-monitoring settings inlined into the browser bundle. */
export function readPublicSentryEnv(source: EnvSource): PublicSentryEnv {
  return parseEnv(publicSentryEnvSchema, source);
}
