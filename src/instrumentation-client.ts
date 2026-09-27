import * as Sentry from "@sentry/nextjs";
import { browserSentryConfig } from "@/lib/env";
import { sentryOptions } from "@/lib/observability/scrub";

declare global {
  interface Window {
    /**
     * The DSN the browser ended up using. The e2e smoke gate reads it to prove
     * the browser got the DSN of the environment it is running in, rather than
     * one frozen into the image at build time.
     */
    __MAKAM_BROWSER_SENTRY_DSN__?: string;
  }
}

/**
 * Browser Sentry, started once the server's own runtime value has arrived.
 *
 * The DSN is a runtime value (one image serves staging and production, each
 * reporting to its own GlitchTip) and the home page is statically rendered, so
 * it cannot be in the HTML: the build has no environment and would freeze an
 * empty string into every static page. The browser therefore asks the running
 * server for it (`/api/browser-config`) and this starts the SDK with what comes
 * back. The environment comes from the page's host for the same reason. The DSN
 * is public by design, so the request carries nothing and the answer is public.
 */
let started: Promise<void> | undefined;

async function startFromServer(): Promise<void> {
  try {
    const { sentryDsn } = (await (await fetch("/api/browser-config")).json()) as { sentryDsn: string };
    window.__MAKAM_BROWSER_SENTRY_DSN__ = sentryDsn;
    // An empty DSN leaves reporting off, which is what an environment without
    // one (development) gets.
    Sentry.init(sentryOptions(browserSentryConfig({ NEXT_PUBLIC_SENTRY_DSN: sentryDsn }, window.location.hostname)));
  } catch (reason) {
    console.warn("[sentry] browser error reporting stays off: the server did not answer", reason);
  }
}

/** Starts browser error reporting. Idempotent: React runs effects twice in dev. */
export function startBrowserSentry(): Promise<void> {
  started ??= startFromServer();
  return started;
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
