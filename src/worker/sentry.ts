import * as Sentry from "@sentry/node";
import { sentryOptions } from "@/lib/observability/scrub";
import type { RuntimeEnv } from "@/lib/env";

/** `worker` Sentry. Disabled when SENTRY_DSN is unset. */
export function initWorkerSentry(env: RuntimeEnv): typeof Sentry {
  Sentry.init({
    ...sentryOptions({
      dsn: env.SENTRY_DSN,
      environment: env.SENTRY_ENVIRONMENT ?? env.APP_ENV,
      release: env.SENTRY_RELEASE,
    }),
    serverName: "worker",
  });
  return Sentry;
}
