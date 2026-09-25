import * as Sentry from "@sentry/nextjs";
import { readSentryEnv } from "@/lib/env";
import { serverSentryOptions } from "@/lib/observability/scrub";

// `web` server (Node) Sentry. Disabled when SENTRY_DSN is unset.
Sentry.init(serverSentryOptions(readSentryEnv()));
