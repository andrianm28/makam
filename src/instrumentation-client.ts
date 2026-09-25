import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/observability/scrub";

// Browser Sentry. NEXT_PUBLIC_* values are inlined at build time; disabled when unset.
Sentry.init(
  sentryOptions({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || "development",
  }),
);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
