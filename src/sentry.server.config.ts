import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/observability/scrub";

// `web` server (Node) Sentry. Disabled when SENTRY_DSN is unset.
Sentry.init(
  sentryOptions({
    dsn: process.env.SENTRY_DSN || undefined,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.APP_ENV || "development",
    release: process.env.SENTRY_RELEASE || undefined,
  }),
);
