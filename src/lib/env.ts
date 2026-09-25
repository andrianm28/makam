import { z } from "zod";

/**
 * Where the app is running. It decides which adapters the composition root
 * wires: `production` uses live adapters only; everything else uses in-memory
 * fakes for the outbound ports.
 */
export const appEnvironments = ["development", "test", "staging", "production"] as const;
export type AppEnvironment = (typeof appEnvironments)[number];

const emptyToUndefined = (value: unknown) => (value === "" ? undefined : value);

const runtimeEnvSchema = z.object({
  APP_ENV: z.enum(appEnvironments).default("development"),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  SENTRY_DSN: z.preprocess(emptyToUndefined, z.url().optional()),
  SENTRY_ENVIRONMENT: z.preprocess(emptyToUndefined, z.string().optional()),
  SENTRY_RELEASE: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Where the Drizzle migrations live (the image sets /app/drizzle); default ./drizzle. */
  MIGRATIONS_DIR: z.preprocess(emptyToUndefined, z.string().optional()),
  /** Svix signing secret the fake PaymentProvider signs its webhooks with. */
  FAKE_PAYMENT_WEBHOOK_SECRET: z.preprocess(
    emptyToUndefined,
    z.string().startsWith("whsec_").optional(),
  ),
});

export type RuntimeEnv = z.infer<typeof runtimeEnvSchema>;

/** Reads and validates the server-side environment. Throws on a bad value. */
export function readRuntimeEnv(source: Record<string, string | undefined> = process.env): RuntimeEnv {
  const parsed = runtimeEnvSchema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
