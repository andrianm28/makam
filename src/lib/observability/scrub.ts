import type { Breadcrumb, ErrorEvent, EventHint, Options } from "@sentry/core";
import type { SentryEnv } from "@/lib/env";

/**
 * PII scrubbing for error monitoring (spec: Architecture; Data and privacy
 * decisions). Errors go through the Sentry SDK to self-hosted GlitchTip in
 * Jakarta, so events stay on this host. Error events still get nothing personal: no
 * request bodies, no phone numbers, no email addresses, no files, no cookies.
 *
 * Shared by the web server, the browser and the worker.
 *
 * A Dokumen is the most sensitive thing this system holds, so two rules cover
 * it: opaque bytes (a `Uint8Array`, a `Blob`, a whole file) never survive as
 * values, and a signed Dokumen URL never survives with its query — the `sig` in
 * that query is the document's read permission for the life of the URL.
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

/** Removes phone numbers and email addresses. Emails first, so their digits are never read as a number. */
export function scrubText(text: string): string {
  return text.replace(EMAIL, EMAIL_PLACEHOLDER).replace(INDONESIAN_PHONE, PHONE_PLACEHOLDER);
}

/**
 * A signed Dokumen URL: the app's own file route, its key, and everything from
 * the `?` on. That query is `exp` and `sig` (`DiskFileStore.signedUrl`,
 * `src/adapters/live/disk-file-store.ts:92`) and the signature is the document's
 * read permission for the life of the URL (`DOKUMEN_URL_SECONDS`, five minutes),
 * so a match keeps the path — which names a Lokasi, an order id and a UUID, not
 * a family — and drops the query. The origin is optional because a same-origin
 * navigation is recorded as its relative form, and because the fetch and xhr
 * crumbs keep whichever form the caller passed to `fetch` or `XMLHttpRequest`.
 */
const SIGNED_DOKUMEN_URL = /((?:[a-z][a-z0-9+.-]*:\/\/[^\s?"'<>]*)?\/api\/files\/[^\s?"'<>]*)\?[^\s"'<>]*/gi;

/**
 * The same rule for the half of it that arrives without its path: the SDK
 * collects a request's query twice, inside the URL and again as
 * `request.query_string`, and a bare query string has no path for
 * SIGNED_DOKUMEN_URL to match. `sig=` is written in exactly one place in this
 * app — `DiskFileStore.signedUrl` — so a `sig` anywhere is a document's read
 * permission, while the `sig` inside `?design=…` or a value like `?p=&sig=1`
 * is not one.
 */
const SIGNATURE_PARAMETER = /(?<=[?&])sig=[^&\s"'<>]*/g;

/** What a document's read permission becomes where the URL it belonged to is not in sight. */
const SIGNATURE_PLACEHOLDER = "sig=[tanda tangan]";

/** What opaque bytes become: a name for them, never their contents. */
const BERKAS_PLACEHOLDER = "[berkas]";

/** Phone numbers, email addresses, and the read permission a signed Dokumen URL carries in its query. */
function scrubUrl(text: string): string {
  return scrubText(text).replace(SIGNED_DOKUMEN_URL, "$1").replace(SIGNATURE_PARAMETER, SIGNATURE_PLACEHOLDER);
}

const MAX_DEPTH = 8;

/**
 * Opaque bytes rather than a record to walk: a `Uint8Array` (and the `Buffer`
 * and `DataView` beside it), a bare `ArrayBuffer`, a `Blob`. None is an array
 * and none is stopped by the depth check, so walking one reshapes a scanned KTP
 * into `{"0":37,"1":80,…}` and sends it whole.
 */
function isBinary(value: object): boolean {
  return ArrayBuffer.isView(value) || value instanceof ArrayBuffer || value instanceof Blob;
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") return scrubUrl(value);
  if (value === null || typeof value !== "object") return value;
  // The binary test comes before the depth cap, not after it: the cap returns a
  // value untouched, and a Uint8Array returned untouched is sent whole as
  // { "0": 37, "1": 80, … }, so a document nested past MAX_DEPTH would still go.
  if (isBinary(value)) return BERKAS_PLACEHOLDER;
  if (depth >= MAX_DEPTH) return value;
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
      // The SDK's own `urlQueryParams: false` already drops a server request's
      // query, but the browser's `HttpContext` writes the page URL in
      // `request.url` ungated by `dataCollection`, and this rule holds even if
      // that option is ever relaxed.
      url: url ? scrubUrl(url) : url,
      query_string: typeof query_string === "string" ? scrubUrl(query_string) : undefined,
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
