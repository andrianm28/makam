import * as Sentry from "@sentry/nextjs";
import { readPublicSentryEnv } from "@/lib/env";
import { sentryOptions } from "@/lib/observability/scrub";

// Browser Sentry. Each NEXT_PUBLIC_* is written out so Next.js inlines it at
// build time; disabled when the DSN is unset.
const env = readPublicSentryEnv({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
  NEXT_PUBLIC_SENTRY_ENVIRONMENT: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
});

Sentry.init(
  sentryOptions({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    environment: env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
  }),
);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
