import type { Breadcrumb, ErrorEvent, EventHint, Options } from "@sentry/core";
import type { SentryEnv } from "@/lib/env";

/**
 * PII scrubbing for error monitoring (spec: Architecture; Data and privacy
 * decisions). Errors go through the Sentry SDK to self-hosted GlitchTip in
 * Jakarta, so events stay on this host; the only data flow out of Indonesia is
 * WhatsApp (Meta, via kirim.dev). Error events still get nothing personal: no
 * request bodies, no phone numbers, no files, no cookies.
 *
 * Shared by the web server, the browser and the worker.
 */

export const PHONE_PLACEHOLDER = "[telepon]";

/**
 * Indonesian mobile numbers: 08..., +62 8..., 62 8..., optionally with spaces,
 * dots or dashes between digits. Bounded by non-digits so amounts, years and
 * ids are left alone.
 */
const INDONESIAN_PHONE = /(?<!\d)(?:\+?62|0)[\s.-]?8(?:[\s.-]?\d){7,11}(?!\d)/g;

export function scrubText(text: string): string {
  return text.replace(INDONESIAN_PHONE, PHONE_PLACEHOLDER);
}

const MAX_DEPTH = 8;

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubText(value);
  if (depth >= MAX_DEPTH || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, depth + 1));
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, scrubValue(item, depth + 1)]),
  );
}

function scrubRecord<T extends Record<string, unknown> | undefined>(record: T): T {
  return (record ? scrubValue(record) : record) as T;
}

const DROPPED_HEADERS = new Set(["cookie", "set-cookie", "authorization", "x-forwarded-for", "x-real-ip"]);
const DROPPED_BREADCRUMB_DATA = new Set(["body", "request_body", "response_body", "data", "input"]);

export function scrubEvent<E extends ErrorEvent>(event: E, hint?: EventHint): E {
  // No files: drop any attachment added to the event.
  if (hint?.attachments) hint.attachments.length = 0;

  if (event.request) {
    const { headers, url, query_string, ...rest } = event.request;
    delete rest.data; // no request bodies
    delete rest.cookies;
    event.request = {
      ...rest,
      url: url ? scrubText(url) : url,
      query_string: typeof query_string === "string" ? scrubText(query_string) : undefined,
      headers: headers
        ? Object.fromEntries(
            Object.entries(headers)
              .filter(([name]) => !DROPPED_HEADERS.has(name.toLowerCase()))
              .map(([name, value]) => [name, scrubText(String(value))]),
          )
        : undefined,
    };
    if (event.request.query_string === undefined) delete event.request.query_string;
    if (event.request.headers === undefined) delete event.request.headers;
  }

  if (event.message) event.message = scrubText(event.message);
  if (event.logentry?.message) event.logentry.message = scrubText(event.logentry.message);
  if (event.logentry?.params) event.logentry.params = scrubValue(event.logentry.params) as unknown[];

  for (const exception of event.exception?.values ?? []) {
    if (exception.value) exception.value = scrubText(exception.value);
    for (const frame of exception.stacktrace?.frames ?? []) {
      delete frame.vars; // local variables may hold anything
    }
  }

  event.extra = scrubRecord(event.extra);
  event.contexts = scrubRecord(event.contexts);
  event.tags = scrubRecord(event.tags) as E["tags"];

  // Keep only the opaque account id.
  if (event.user) event.user = event.user.id === undefined ? {} : { id: event.user.id };

  event.breadcrumbs = event.breadcrumbs?.map((crumb) => scrubBreadcrumb(crumb));
  return event;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const scrubbed: Breadcrumb = { ...breadcrumb };
  if (scrubbed.message) scrubbed.message = scrubText(scrubbed.message);
  if (scrubbed.data) {
    scrubbed.data = scrubValue(
      Object.fromEntries(
        Object.entries(scrubbed.data).filter(([key]) => !DROPPED_BREADCRUMB_DATA.has(key)),
      ),
    ) as Breadcrumb["data"];
  }
  return scrubbed;
}

export interface SentrySettings {
  dsn: string | undefined;
  environment: string;
  release?: string;
}

/** The options every Sentry.init in the app uses. Disabled when the DSN is unset. */
export function sentryOptions(settings: SentrySettings) {
  return {
    dsn: settings.dsn,
    enabled: Boolean(settings.dsn),
    environment: settings.environment,
    release: settings.release,
    // Sentry v11's replacement for sendDefaultPii: collect as little as possible.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: ["user-agent", "accept-language", "content-type"] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    attachStacktrace: true,
    maxValueLength: 1000,
    // Errors only in v1: no tracing, replays or profiling, so no spans carrying data.
    beforeSend: (event: ErrorEvent, hint: EventHint) => scrubEvent(event, hint),
    beforeBreadcrumb: (breadcrumb: Breadcrumb) => scrubBreadcrumb(breadcrumb),
  } satisfies Options;
}

/** The web server's and the worker's options, from the validated env. */
export function serverSentryOptions(env: SentryEnv) {
  return sentryOptions({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.APP_ENV,
    release: env.SENTRY_RELEASE,
  });
}
