import { z } from "zod";

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

const runtimeEnvSchema = sentryEnvSchema.extend({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
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
})
  .superRefine((env, ctx) => {
    if (usesInMemoryFakes(env.APP_ENV)) return;
    for (const key of ["AUTH_SECRET", "APP_BASE_URL", "TOTP_ENCRYPTION_KEY"] as const) {
      if (!env[key]) ctx.addIssue({ code: "custom", path: [key], message: `${key} is required in ${env.APP_ENV}` });
    }
  })
  .transform(({ FAKE_PAYMENT_WEBHOOK_SECRET, AUTH_SECRET, APP_BASE_URL, TOTP_ENCRYPTION_KEY, ...env }) => ({
    ...env,
    FAKE_PAYMENT_WEBHOOK_SECRET: usesInMemoryFakes(env.APP_ENV) ? FAKE_PAYMENT_WEBHOOK_SECRET : undefined,
    AUTH_SECRET: AUTH_SECRET ?? LOCAL_AUTH_SECRET,
    APP_BASE_URL: APP_BASE_URL ?? LOCAL_BASE_URL,
    TOTP_ENCRYPTION_KEY: TOTP_ENCRYPTION_KEY ?? LOCAL_TOTP_ENCRYPTION_KEY,
  }));

/**
 * Browser error monitoring. Next.js inlines NEXT_PUBLIC_* at build time, so the
 * caller passes each one written out (`process.env.NEXT_PUBLIC_SENTRY_DSN`).
 * The environment is not among them: one image serves staging and production,
 * so the browser takes it from the page's host (`browserSentryEnvironment`).
 */
const publicSentryEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
});

const browserEnvironmentByHost: Record<string, AppEnvironment> = {
  "dev.makam.co.id": "staging",
  "makam.co.id": "production",
  "www.makam.co.id": "production",
};

/** The Sentry environment for browser events, from `window.location.hostname`. Unknown hosts are `development`. */
export function browserSentryEnvironment(hostname: string): AppEnvironment {
  return browserEnvironmentByHost[hostname.toLowerCase()] ?? "development";
}

export type SentryEnv = z.infer<typeof sentryEnvSchema>;
export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;
export type PublicSentryEnv = z.infer<typeof publicSentryEnvSchema>;

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

/** Reads and validates only the error-monitoring settings (web server Sentry). */
export function readSentryEnv(source: EnvSource = process.env): SentryEnv {
  return parseEnv(sentryEnvSchema, source);
}

/** Validates the NEXT_PUBLIC_* error-monitoring settings inlined into the browser bundle. */
export function readPublicSentryEnv(source: EnvSource): PublicSentryEnv {
  return parseEnv(publicSentryEnvSchema, source);
}
