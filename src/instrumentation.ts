import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.server.config");
  }
}

// Errors from Server Components, Server Actions, route handlers and proxies.
export const onRequestError = Sentry.captureRequestError;
