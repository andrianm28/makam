import { z } from "zod";

/**
 * Where the app is running. It decides which adapters the composition root
 * wires: `production` uses live adapters only; everything else uses in-memory
 * fakes for the outbound ports.
 */
export const appEnvironments = ["development", "test", "staging", "production"] as const;
export type AppEnvironment = (typeof appEnvironments)[number];

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

type EnvSource = Record<string, string | undefined>;

/** Error monitoring (Sentry SDK to GlitchTip). Needs nothing else, so it works even when the rest is misconfigured. */
const sentryEnvSchema = z.object({
  APP_ENV: z.enum(appEnvironments).default("development"),
  SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  SENTRY_RELEASE: z.preprocess(emptyToUndefined, z.string().optional()),
});

const runtimeEnvSchema = sentryEnvSchema.extend({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  /** Where the Drizzle migrations live (the image sets /app/drizzle); default ./drizzle. */
  MIGRATIONS_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Svix signing secret the fake PaymentProvider signs its webhooks with. */
  FAKE_PAYMENT_WEBHOOK_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().startsWith("whsec_").optional(),
  ),
});

/**
 * Browser error monitoring. Next.js inlines NEXT_PUBLIC_* at build time, so the
 * caller passes each one written out (`process.env.NEXT_PUBLIC_SENTRY_DSN`).
 */
const publicSentryEnvSchema = z.object({
  NEXT_PUBLIC_SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().default("development")),
});

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
