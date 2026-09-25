import * as Sentry from "@sentry/node";
import { serverSentryOptions } from "@/lib/observability/scrub";
import type { RuntimeEnv } from "@/lib/env";

/** `worker` Sentry. Disabled when SENTRY_DSN is unset. */
export function initWorkerSentry(env: RuntimeEnv): typeof Sentry {
  Sentry.init({ ...serverSentryOptions(env), serverName: "worker" });
  return Sentry;
}
