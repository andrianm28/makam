import type { Breadcrumb, ErrorEvent, EventHint, Options } from "@sentry/core";
import type { SentryEnv } from "@/lib/env";

/**
 * PII scrubbing for error monitoring (spec: Architecture; Data and privacy
 * decisions). Errors go through the Sentry SDK to self-hosted GlitchTip in
 * Jakarta, so events stay on this host. Error events still get nothing personal: no
 * request bodies, no phone numbers, no email addresses, no files, no cookies.
 *
 * Shared by the web server, the browser and the worker.
 */

export const PHONE_PLACEHOLDER = "[telepon]";
export const EMAIL_PLACEHOLDER = "[email]";

/** An email address: local part, @, a domain with at least one dot. */
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/g;

/** One optional space, dot or dash between digit groups. */
const SEP = String.raw`[\s.-]?`;
/**
 * Not glued to a hex digit (UUIDs, hashes), to a digit plus separator (amounts
 * like 12.025.500, ids like MKM-2026-021234) or to "Rp" (Rp 6221000000).
 */
const START = String.raw`(?<![0-9A-Fa-f]|\d[.,-]|Rp\.?\s?)`;
const END = String.raw`(?![0-9A-Fa-f]|[.,-]\d)`;
/** The country code without "+", unless it opens a dotted amount (62.250.000). */
const BARE_62 = String.raw`(?!62(?:\.\d{3})+(?!\d))62`;
/** Mobile: 08..., +62 8..., 62 8..., then 7-11 more digits. */
const MOBILE = String.raw`(?:\+62|${BARE_62}|0)${SEP}8(?:${SEP}\d){7,11}`;
/**
 * Landline: a 2-3 digit area code (not 8, which is mobile) after 0, +62 or 62,
 * optionally in parentheses, then a 5-8 digit subscriber number: 021 1234 5678,
 * (0251) 123456, +62 21 1234 5678, 62-21-1234-5678.
 */
const LANDLINE = String.raw`(?:(?:\+62|${BARE_62})${SEP}\(?|\(?0)[2-79]\d{1,2}\)?${SEP}\d(?:${SEP}\d){4,7}`;

/**
 * Indonesian phone numbers, mobile and landline, with or without separators.
 * Amounts, years, Nomor Pemesanan, timestamps and UUIDs are left alone.
 */
const INDONESIAN_PHONE = new RegExp(`${START}(?:${MOBILE}|${LANDLINE})${END}`, "g");

export const REKENING_PLACEHOLDER = "[rekening]";

/**
 * A bank account number (a refund's destination, ticket 31): 10-16 digits in one
 * run, or 12-16 in groups of four. Not glued to a letter or digit, and not an
 * amount: "Rp" before it, or a separator between digit groups, leaves it alone.
 * Phone numbers are scrubbed first, so a mobile number is never called an account.
 */
const REKENING = new RegExp(
  String.raw`(?<![0-9A-Za-z]|\d[.,-]|Rp\.?\s?)(?:\d{10,16}|\d{4}(?:[ -]\d{4}){2,3})(?![0-9A-Za-z]|[.,-]\d)`,
  "g",
);

export const TANDA_PLACEHOLDER = "[tanda]";

/** The signed query of the Surat Kuasa render link (`tanda`, `sampai`): the signature is a short-lived key to a family document. */
const TANDA_LINK = /([?&](?:tanda|sampai)=)[^&#\s"']*/g;

/** Removes phone numbers, email addresses, bank account numbers and the signed query of a render link. Emails first, so their digits are never read as a number. */
export function scrubText(text: string): string {
  return text
    .replace(TANDA_LINK, `$1${TANDA_PLACEHOLDER}`)
    .replace(EMAIL, EMAIL_PLACEHOLDER)
    .replace(INDONESIAN_PHONE, PHONE_PLACEHOLDER)
    .replace(REKENING, REKENING_PLACEHOLDER);
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
