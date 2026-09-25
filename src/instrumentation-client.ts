import * as Sentry from "@sentry/nextjs";
import { browserSentryEnvironment, readPublicSentryEnv } from "@/lib/env";
import { sentryOptions } from "@/lib/observability/scrub";

// Browser Sentry. The DSN is written out so Next.js inlines it at build time;
// disabled when it is unset. The environment comes from the page's host at
// runtime, because one image serves both staging and production.
const env = readPublicSentryEnv({
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

Sentry.init(
  sentryOptions({
    dsn: env.NEXT_PUBLIC_SENTRY_DSN,
    environment: browserSentryEnvironment(window.location.hostname),
  }),
);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
