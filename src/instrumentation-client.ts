import * as Sentry from "@sentry/nextjs";
import { browserSentryConfig } from "@/lib/env";
import { sentryOptions } from "@/lib/observability/scrub";

// Browser Sentry. The DSN is a runtime value the server put in the page
// (RootLayout), because one image serves staging and production and each
// environment reports to its own GlitchTip; the environment comes from the
// page's host for the same reason. An empty DSN leaves reporting off.
declare global {
  interface Window {
    __MAKAM_BROWSER_SENTRY_DSN__?: string;
  }
}

const config = browserSentryConfig(
  { NEXT_PUBLIC_SENTRY_DSN: window.__MAKAM_BROWSER_SENTRY_DSN__ },
  window.location.hostname,
);

Sentry.init(sentryOptions({ dsn: config.dsn, environment: config.environment }));

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
