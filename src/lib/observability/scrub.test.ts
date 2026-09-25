import type { Breadcrumb, ErrorEvent } from "@sentry/core";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubText, sentryOptions } from "./scrub";

describe("phone number scrubbing", () => {
  it.each([
    ["081234567890", "local 08 format"],
    ["0812-3456-7890", "local with dashes"],
    ["0812 3456 7890", "local with spaces"],
    ["+6281234567890", "international +62"],
    ["+62 812-3456-7890", "international +62 with separators"],
    ["6281234567890", "international 62 without plus"],
    ["62 812 3456 7890", "62 with spaces"],
  ])("removes %s (%s)", (phone) => {
    expect(scrubText(`OTP gagal untuk ${phone}, coba lagi`)).toBe(
      "OTP gagal untuk [telepon], coba lagi",
    );
  });

  it("keeps ordinary numbers such as amounts, years and ids", () => {
    const text = "Tagihan TAG-2026-000123 Rp 7500000 jatuh tempo 2026-10-01";
    expect(scrubText(text)).toBe(text);
  });
});

describe("Sentry event scrubbing", () => {
  it("drops request bodies, cookies and auth headers, and scrubs phone numbers from the URL", () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: "https://makam.co.id/masuk?nomor=081234567890",
        query_string: "nomor=081234567890",
        data: { phone: "081234567890", ktp: "3171..." },
        cookies: { session: "secret" },
        headers: { cookie: "session=secret", authorization: "Bearer x", "user-agent": "UA" },
      },
    } as ErrorEvent);

    expect(event.request?.data).toBeUndefined();
    expect(event.request?.cookies).toBeUndefined();
    expect(event.request?.headers).toEqual({ "user-agent": "UA" });
    expect(event.request?.url).toBe("https://makam.co.id/masuk?nomor=[telepon]");
    expect(event.request?.query_string).toBe("nomor=[telepon]");
  });

  it("scrubs phone numbers from messages, exceptions, extra data and tags", () => {
    const event = scrubEvent({
      type: undefined,
      message: "Gagal kirim ke +6281234567890",
      exception: { values: [{ type: "Error", value: "No account for 0812-3456-7890" }] },
      extra: { recipient: { phone: "6281234567890" }, list: ["081234567890"] },
      tags: { phone: "081234567890" },
      user: { id: "u1", username: "081234567890", ip_address: "1.2.3.4", email: "a@b.c" },
    } as ErrorEvent);

    expect(event.message).toBe("Gagal kirim ke [telepon]");
    expect(event.exception?.values?.[0]?.value).toBe("No account for [telepon]");
    expect(event.extra).toEqual({ recipient: { phone: "[telepon]" }, list: ["[telepon]"] });
    expect(event.tags).toEqual({ phone: "[telepon]" });
    expect(event.user).toEqual({ id: "u1" });
  });

  it("scrubs breadcrumbs and drops their request/response bodies", () => {
    const crumb = scrubBreadcrumb({
      category: "fetch",
      message: "POST /api/otp 081234567890",
      data: { url: "/api/otp?to=081234567890", body: "{...}", request_body: "x", response_body: "y" },
    } as Breadcrumb);

    expect(crumb.message).toBe("POST /api/otp [telepon]");
    expect(crumb.data).toEqual({ url: "/api/otp?to=[telepon]" });
  });
});

describe("Sentry options", () => {
  it("is disabled when no DSN is set", () => {
    expect(sentryOptions({ dsn: undefined, environment: "development" }).enabled).toBe(false);
  });

  it("collects no bodies, cookies, user info, query params or local variables, and runs the scrubbers", () => {
    const options = sentryOptions({ dsn: "https://k@o.ingest.sentry.io/1", environment: "production" });
    expect(options.enabled).toBe(true);
    expect(options.dataCollection).toMatchObject({
      userInfo: false,
      cookies: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    });
    expect(options.attachStacktrace).toBe(true);
    expect(options.beforeSend).toBeTypeOf("function");
    expect(options.beforeBreadcrumb).toBeTypeOf("function");
    expect(options.maxValueLength).toBeLessThanOrEqual(1000);
  });
});
