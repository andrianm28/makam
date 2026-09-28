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
 * message or a tag, and a signed Dokumen URL in a request or a breadcrumb. The
 * ones it does not handle are written as the behaviour they have today, not as
 * the behaviour we would wish for, and each carries the line that lets it
 * through.
 */
import type { Breadcrumb, ErrorEvent, EventHint } from "@sentry/core";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, sentryOptions } from "./scrub";

/** A FileStore key as `src/domain/pemesanan/berkas.ts` and its neighbours build it: a prefix, an id, a random UUID and an extension. */
const KUNCIPAN_SCAN_PERJANJIAN = "perjanjian/1b2c3d4e-5f60-4a1b-8c9d-0e1f2a3b4c5d/9a8b7c6d-5e4f-4a3b-9c8d-7e6f5a4b3c2d.pdf";
const KUNCIPAN_FOTO_IPTM = "pengurusan/foto-iptm/4d5e6f70-8192-4a3b-8c5d-6e7f8091a2b3.jpg";
/** What `DiskFileStore.signedUrl` returns: the key, plus an expiry and the HMAC that is the whole permission. */
const TANDA_TANGAN = "kQ3x7vN0pR8sT2wY5aB9cD1eF4gH6jK0lM3nO7qS2u";
const URL_BUKTI = `https://makam.co.id/api/files/${KUNCIPAN_SCAN_PERJANJIAN}?exp=1789012345&sig=${TANDA_TANGAN}`;
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
  it("leaves a Bukti Pembayaran's bytes in extra as an index-to-byte record", () => {
    const event = scrubEvent({
      type: undefined,
      extra: { bukti: { nama: "Bukti Pembayaran", body: new Uint8Array([0x25, 0x50, 0x44, 0x46]) } },
    } as ErrorEvent);

    // `scrubValue` walks a Uint8Array as a plain object (`scrub.ts:53-57`), so the
    // bytes are not dropped, only reshaped into { "0": 37, "1": 80, … }.
    expect(event.extra).toEqual({ bukti: { nama: "Bukti Pembayaran", body: { 0: 0x25, 1: 0x50, 2: 0x44, 3: 0x46 } } });
  });

  it("leaves a photo of a KTP in a logentry parameter as well", () => {
    const event = scrubEvent({
      type: undefined,
      logentry: { message: "Gagal membaca berkas", params: [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])] },
    } as ErrorEvent);

    expect(event.logentry?.params).toEqual([{ 0: 0xff, 1: 0xd8, 2: 0xff, 3: 0xe0 }]);
  });

  it("leaves a base64 data: URL of a photo in a message untouched", () => {
    const event = scrubEvent({ type: undefined, message: `Gagal merender ${DATA_URL_KTP}` } as ErrorEvent);

    expect(event.message).toBe(`Gagal merender ${DATA_URL_KTP}`);
  });
});

describe("a FileStore key and the signed Dokumen URL", () => {
  it("keeps a FileStore key in an error message", () => {
    // The message DiskFileStore.signedUrl throws for a key with no file
    // (`src/adapters/live/disk-file-store.ts:84`), which reaches `beforeSend`
    // through the web server's `captureRequestError`. The key itself names an id
    // and a UUID, not the family.
    const message = `No file stored at ${KUNCIPAN_SCAN_PERJANJIAN}`;

    expect(scrubEvent({ type: undefined, message } as ErrorEvent).message).toBe(message);
  });

  it("keeps a FileStore key in a tag", () => {
    // The shape a `ReportError` caller can actually pass today: its context is
    // `{ tags }` (`src/lib/observability/report-error.ts:10`), which Sentry
    // merges into `event.tags`, and `scrubRecord` only runs `scrubText` over it.
    const event = scrubEvent({ type: undefined, tags: { foto: KUNCIPAN_FOTO_IPTM } } as ErrorEvent);

    expect(event.tags).toEqual({ foto: KUNCIPAN_FOTO_IPTM });
  });

  it("keeps a signed Dokumen URL in a request URL and query string", () => {
    const event = scrubEvent({
      type: undefined,
      request: { method: "GET", url: URL_BUKTI, query_string: `exp=1789012345&sig=${TANDA_TANGAN}` },
    } as ErrorEvent);

    expect(event.request?.url).toBe(URL_BUKTI);
    expect(event.request?.query_string).toBe(`exp=1789012345&sig=${TANDA_TANGAN}`);
  });

  it.each([
    ["navigation", { from: "/staf/admin-platform/lokasi/1b2c3d4e-5f60-4a1b-8c9d-0e1f2a3b4c5d/perjanjian", to: URL_BUKTI }],
    ["fetch", { url: URL_BUKTI, method: "GET", status_code: 200 }],
    ["xhr", { url: URL_BUKTI, method: "GET", status_code: 200 }],
  ])("keeps the signed Dokumen URL in a %s breadcrumb", (category, data) => {
    // The agreement scan is opened with a 303 to its signed URL
    // (`src/app/staf/admin-platform/lokasi/[lokasiId]/perjanjian/route.ts:20`), so
    // the browser really does navigate to it; the browser SDK records that as a
    // `navigation` crumb whose `data.to` is the path and query. `from`, `to` and
    // `url` are not in `DROPPED_BREADCRUMB_DATA` (`scrub.ts:65`) and a base64url
    // signature is neither a phone number nor an address, so it all survives.
    const crumb = scrubBreadcrumb({ category, data } as Breadcrumb);

    expect(crumb.data).toEqual(data);
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
