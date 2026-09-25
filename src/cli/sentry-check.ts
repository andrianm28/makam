/**
 * `node dist/sentry-check.mjs <web|worker>`: sends one intentional test error
 * to GlitchTip through the same Sentry options (and PII scrubbing) the web
 * server and the worker use, then prints the event id.
 *
 * The event deliberately carries a request body, a cookie, and phone numbers
 * in the message, the URL, the query string and the extra data, so a look at
 * the stored event in GlitchTip shows whether scrubbing held
 * (docs/ops/runbook.md, "Test error").
 *
 *   docker compose -p makam-staging ... exec web node dist/sentry-check.mjs web
 *   docker compose -p makam-staging ... exec worker node dist/sentry-check.mjs worker
 */
import * as Sentry from "@sentry/node";
import { readSentryEnv } from "@/lib/env";
import { serverSentryOptions } from "@/lib/observability/scrub";

const SAMPLE_PHONE = "0812-3456-7890";

async function main() {
  const service = process.argv[2];
  if (service !== "web" && service !== "worker") {
    console.error("usage: sentry-check <web|worker>");
    process.exit(64);
  }
  const env = readSentryEnv();
  if (!env.SENTRY_DSN) {
    console.error("[sentry-check] SENTRY_DSN is not set; nothing sent");
    process.exit(78);
  }

  Sentry.init({ ...serverSentryOptions(env), serverName: service });
  const eventId = Sentry.withScope((scope) => {
    scope.setTag("check", "glitchtip-test-error");
    scope.setExtra("pemesan", { phone: `+62 ${SAMPLE_PHONE.slice(1)}` });
    scope.addEventProcessor((event) => ({
      ...event,
      request: {
        method: "POST",
        url: `https://dev.makam.co.id/sentry-check?wa=${SAMPLE_PHONE}`,
        query_string: `wa=${SAMPLE_PHONE}`,
        data: JSON.stringify({ phone: SAMPLE_PHONE, note: "request body must not arrive" }),
        cookies: { session: "must-not-arrive" },
        headers: { cookie: "session=must-not-arrive", "user-agent": "sentry-check" },
      },
    }));
    return Sentry.captureException(
      new Error(`Intentional GlitchTip test error from ${service} (phone ${SAMPLE_PHONE} must be scrubbed)`),
    );
  });

  const flushed = await Sentry.flush(10_000);
  console.log(`[sentry-check] ${service}: event ${eventId} ${flushed ? "sent" : "NOT flushed"} (${env.SENTRY_ENVIRONMENT ?? env.APP_ENV})`);
  process.exit(flushed ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("[sentry-check] failed", error);
  process.exit(1);
});
