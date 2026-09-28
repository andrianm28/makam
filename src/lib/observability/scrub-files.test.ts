/**
 * The third of the three privacy rules AGENTS.md states for error reporting
 * ("Sentry gets no request bodies, no phone numbers, no files") had no test:
 * `scrub.test.ts` covers bodies and phone numbers, while a family's uploaded
 * document — a KTP, an Akta Kematian, a Hak Pakai grant, the IPTM photo — is
 * the most sensitive thing this system holds.
 *
 * These tests pin what `scrubEvent`, `scrubBreadcrumb` and `sentryOptions`
 * actually do with a file, in the shapes a file can reach them in: a Sentry
 * `Attachment`, raw bytes in the event payload, a FileStore key in an error
 * message or a tag, and a signed Dokumen URL in a request or a breadcrumb.
 *
 * They were first written as the behaviour the scrubber had, not the behaviour
 * we would want, and each named the line that let it through. Every one the fix
 * reaches now asserts the fixed behaviour instead: opaque bytes become a
 * placeholder, and a signed Dokumen URL keeps its path and loses the query that
 * carries its read permission. Two shapes are still what they were, and say so
 * where they sit: a base64 `data:` URL and a signed URL inside a message are
 * both text, `event.message` goes through `scrubText` alone (`scrub.ts:145`),
 * and neither has a producer in this app.
 */
import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/core";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, sentryOptions } from "./scrub";

/** A FileStore key as `src/domain/pemesanan/berkas.ts` and its neighbours build it: a prefix, an id, a random UUID and an extension. */
const KUNCIPAN_SCAN_PERJANJIAN = "perjanjian/1b2c3d4e-5f60-4a1b-8c9d-0e1f2a3b4c5d/9a8b7c6d-5e4f-4a3b-9c8d-7e6f5a4b3c2d.pdf";
const KUNCIPAN_FOTO_IPTM = "pengurusan/foto-iptm/4d5e6f70-8192-4a3b-8c5d-6e7f8091a2b3.jpg";
/** What `DiskFileStore.signedUrl` returns: the key, plus an expiry and the HMAC that is the whole permission. */
const TANDA_TANGAN = "kQ3x7vN0pR8sT2wY5aB9cD1eF4gH6jK0lM3nO7qS2u";
/** The signed URL as the app route builds it: the path, then `exp` and `sig`. */
const JALAN_BUKTI = `/api/files/${KUNCIPAN_SCAN_PERJANJIAN}`;
const QUERY_BUKTI = `?exp=1789012345&sig=${TANDA_TANGAN}`;
const URL_BUKTI = `https://makam.co.id${JALAN_BUKTI}${QUERY_BUKTI}`;
/** What the same URL is once the query is gone: a Lokasi Mitra, an order id and a UUID, naming nobody. */
const JALAN_BUKTI_TANPA_QUERY = `https://makam.co.id${JALAN_BUKTI}`;
/** The staff page the Perjanjian scan is opened from, as the SDK records it. */
const HALAMAN_PERJANJIAN = "/staf/admin-platform/lokasi/1b2c3d4e-5f60-4a1b-8c9d-0e1f2a3b4c5d/perjanjian";
/** A photo of a KTP, inline: the shape a browser hands a canvas or an `<img src>`. */
const DATA_URL_KTP = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof";

describe("a Dokumen attached to a Sentry event", () => {
  it.each([
    ["raw bytes", { filename: "Bukti-Pembayaran.pdf", contentType: "application/pdf", data: new Uint8Array([0x25, 0x50, 0x44, 0x46]) }],
    ["a base64 data: URL", { filename: "foto-iptm.jpg", contentType: "image/jpeg", data: DATA_URL_KTP }],
  ])("drops an attached Dokumen whole, %s and filename alike", (_bentuk, lampiran) => {
    const hint: EventHint = { attachments: [lampiran] };

    scrubEvent({ type: undefined } as ErrorEvent, hint);

    expect(hint.attachments).toEqual([]);
  });

  it("empties the hint's own attachment array, which is the array the envelope reads", () => {
    const attachments = [{ filename: "akta-kematian.pdf", data: new Uint8Array([0xff, 0xd8, 0xff]) }];
    const hint: EventHint = { attachments };

    scrubEvent({ type: undefined } as ErrorEvent, hint);

    expect(hint.attachments).toBe(attachments);
    expect(attachments).toEqual([]);
  });
});

describe("Dokumen bytes inside the event payload", () => {
  it("replaces a Bukti Pembayaran's bytes in extra with a placeholder", () => {
    const event = scrubEvent({
      type: undefined,
      extra: { bukti: { nama: "Bukti Pembayaran", body: new Uint8Array([0x25, 0x50, 0x44, 0x46]) } },
    } as ErrorEvent);

    // `isBinary` stops `scrubValue` before it walks a Uint8Array as a plain
    // object (`scrub.ts:103`), which used to reshape the bytes into
    // { "0": 37, "1": 80, … } and send the whole scan.
    expect(event.extra).toEqual({ bukti: { nama: "Bukti Pembayaran", body: "[berkas]" } });
  });

  it("replaces a photo of a KTP in a logentry parameter too", () => {
    const event = scrubEvent({
      type: undefined,
      logentry: { message: "Gagal membaca berkas", params: [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])] },
    } as ErrorEvent);

    expect(event.logentry?.params).toEqual(["[berkas]"]);
  });

  // The other two shapes the rule names, in every container the bytes reach
  // (`scrub.ts:147,156-157` for the three of them), and a DataView beside them:
  // a Buffer is a Uint8Array, and none of the four is an array.
  it.each([
    ["a bare ArrayBuffer", new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer],
    ["a Blob", new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" })],
    ["a DataView", new DataView(new Uint8Array([0x25, 0x50]).buffer)],
  ])("replaces %s in extra, in a context and in a logentry parameter alike", (_bentuk, isi) => {
    const event = scrubEvent({
      type: undefined,
      extra: { lampiran: isi },
      contexts: { pemesanan: { bukti: isi } },
      logentry: { message: "Gagal membaca berkas", params: [isi] },
    } as ErrorEvent);

    expect(event.extra).toEqual({ lampiran: "[berkas]" });
    expect(event.contexts).toEqual({ pemesanan: { bukti: "[berkas]" } });
    expect(event.logentry?.params).toEqual(["[berkas]"]);
  });

  it("keeps a base64 data: URL of a photo in a message, which no rule here reaches", () => {
    // An inline `data:` URL is the document itself, base64. `scrubUrl` drops a
    // signed Dokumen URL's query and `scrubValue` replaces opaque bytes, but a
    // message is text and `event.message` goes through `scrubText` alone
    // (`scrub.ts:145`). Nothing in this app builds one: an upload is a `File`
    // body through a Server Action, and no `readAsDataURL`, `toDataURL` or
    // `data:image` exists under `src/`. A hole in the control rather than a
    // reachable leak, recorded here rather than closed.
    const event = scrubEvent({ type: undefined, message: `Gagal merender ${DATA_URL_KTP}` } as ErrorEvent);

    expect(event.message).toBe(`Gagal merender ${DATA_URL_KTP}`);
  });

  it("keeps a signed Dokumen URL in a message, for the same reason", () => {
    // The same boundary, with the document's read permission rather than the
    // document: a signed URL is a URL, and a message is not scrubbed as one.
    // Nothing puts one in a message — `signedUrl`'s result goes to the 303's
    // Location header, a page, or a push `url` that must be a staff page path
    // (`src/domain/notifications/index.ts:381`) — so this records the edge of
    // the rule instead of a leak someone can reach.
    const event = scrubEvent({ type: undefined, message: `Gagal membuka ${URL_BUKTI}` } as ErrorEvent);

    expect(event.message).toBe(`Gagal membuka ${URL_BUKTI}`);
  });
});

describe("a FileStore key and the signed Dokumen URL", () => {
  it("keeps a FileStore key in an error message", () => {
    // The message DiskFileStore.signedUrl throws for a key with no file
    // (`src/adapters/live/disk-file-store.ts:84`), which reaches `beforeSend`
    // through the web server's `captureRequestError`. The key itself names an id
    // and a UUID, not the family, and a message is not scrubbed as a URL.
    const message = `No file stored at ${KUNCIPAN_SCAN_PERJANJIAN}`;

    expect(scrubEvent({ type: undefined, message } as ErrorEvent).message).toBe(message);
  });

  it("keeps a FileStore key in a tag", () => {
    // The shape a `ReportError` caller can actually pass today: its context is
    // `{ tags }` (`src/lib/observability/report-error.ts:10`), which Sentry
    // merges into `event.tags`. A tag now goes through `scrubUrl` too, and a
    // bare key has neither a `?` nor a `sig=`, so it survives whole: the rule
    // takes a document's read permission, not the id that names it.
    const event = scrubEvent({ type: undefined, tags: { foto: KUNCIPAN_FOTO_IPTM } } as ErrorEvent);

    expect(event.tags).toEqual({ foto: KUNCIPAN_FOTO_IPTM });
  });

  it("reduces a signed Dokumen URL in the request to its path and takes the signature out of the query string", () => {
    const event = scrubEvent({
      type: undefined,
      request: { method: "GET", url: URL_BUKTI, query_string: `exp=1789012345&sig=${TANDA_TANGAN}` },
    } as ErrorEvent);

    // The path names a Lokasi Mitra, an order id and a UUID; the query is `exp`
    // and `sig`, and that signature is the document's read permission for the
    // life of the URL (`DOKUMEN_URL_SECONDS`, five minutes).
    // `SIGNED_DOKUMEN_URL` keeps the first and drops the second. The SDK
    // collects the query twice, and a bare query string carries no path to
    // match, so `SIGNATURE_PARAMETER` takes the same `sig` on its own.
    expect(event.request?.url).toBe(JALAN_BUKTI_TANPA_QUERY);
    expect(event.request?.query_string).toBe("exp=1789012345&sig=[tanda tangan]");
  });

  it.each([
    // The agreement scan is opened with a 303 to its signed URL
    // (`src/app/staf/admin-platform/lokasi/[lokasiId]/perjanjian/route.ts:20`),
    // so the browser really does navigate to it, and a same-origin navigation is
    // recorded as its relative form: `parseUrl(...).relative` in
    // `@sentry/browser`'s breadcrumbs integration is path, query and fragment.
    [
      "same-origin navigation",
      { category: "navigation", data: { from: HALAMAN_PERJANJIAN, to: `${JALAN_BUKTI}${QUERY_BUKTI}` } },
      { from: HALAMAN_PERJANJIAN, to: JALAN_BUKTI },
    ],
    // A different host keeps its origin, and must lose the query all the same.
    [
      "cross-origin navigation",
      { category: "navigation", data: { from: HALAMAN_PERJANJIAN, to: URL_BUKTI } },
      { from: HALAMAN_PERJANJIAN, to: JALAN_BUKTI_TANPA_QUERY },
    ],
    [
      "fetch",
      { category: "fetch", data: { url: URL_BUKTI, method: "GET", status_code: 200 } },
      { url: JALAN_BUKTI_TANPA_QUERY, method: "GET", status_code: 200 },
    ],
    [
      "xhr",
      { category: "xhr", data: { url: URL_BUKTI, method: "GET", status_code: 200 } },
      { url: JALAN_BUKTI_TANPA_QUERY, method: "GET", status_code: 200 },
    ],
  ])("reduces the signed Dokumen URL in a %s breadcrumb to its path", (_bentuk, crumb, data) => {
    // `from`, `to` and `url` are not in DROPPED_BREADCRUMB_DATA
    // (`scrub.ts:115`), and no `dataCollection` option filters a breadcrumb's
    // URL — the SDK's `urlQueryParams: false` covers the server's request and
    // not this. All three keys are string values, so they reach `scrubValue`'s
    // string branch and the one `scrubUrl` in it covers every one of them, which
    // is what the four cases above assert: the signed URL is reduced and the
    // keys beside it are untouched.
    expect(scrubBreadcrumb(crumb as Breadcrumb).data).toEqual(data);
  });

  it("leaves a page's own query alone, signature or not", () => {
    // The rule takes a query parameter *named* `sig` and a URL on the file
    // route, nothing else: a page keeps its values, including a `design` one
    // that has the letters in it.
    const url = "https://makam.co.id/pesan-makam/terencana?design=merah&page=2";
    const event = scrubEvent({ type: undefined, request: { method: "GET", url } } as ErrorEvent);

    expect(event.request?.url).toBe(url);
  });

  it("drops a Dokumen sent as a breadcrumb's request body", () => {
    const crumb = scrubBreadcrumb({
      category: "xhr",
      message: "POST /pesan-makam/terencana/berkas",
      data: { url: "/pesan-makam/terencana/berkas", method: "POST", body: DATA_URL_KTP },
    } as Breadcrumb);

    expect(crumb.data).toEqual({ url: "/pesan-makam/terencana/berkas", method: "POST" });
  });
});

describe("Sentry options and a file", () => {
  it("drops a Dokumen attachment through the beforeSend every Sentry.init uses", () => {
    const { beforeSend } = sentryOptions({ dsn: "https://k@glitchtip.makam.co.id/1", environment: "production" });
    const hint: EventHint = {
      attachments: [{ filename: "akta-kematian.pdf", contentType: "application/pdf", data: new Uint8Array([0x25, 0x50]) }],
    };

    beforeSend({ type: undefined } as ErrorEvent, hint);

    expect(hint.attachments).toEqual([]);
  });

  // The two options that keep a Dokumen out before the event is ever built: a
  // multipart upload is not a collected body, and a Server Action frame holding
  // `file.body` is not a collected local variable.
  it("collects no request bodies and no stack frame variables", () => {
    expect(sentryOptions({ dsn: "https://k@glitchtip.makam.co.id/1", environment: "production" }).dataCollection)
      .toMatchObject({ httpBodies: [], stackFrameVariables: false });
  });
});
