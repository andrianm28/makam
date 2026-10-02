import type { Breadcrumb, ErrorEvent } from "@sentry/core";
import { describe, expect, it } from "vitest";
import { scrubBreadcrumb, scrubEvent, scrubText, sentryOptions, serverSentryOptions } from "./scrub";

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

  it.each([
    ["021 1234 5678", "Jakarta landline with spaces"],
    ["02112345678", "Jakarta landline without separators"],
    ["(021) 12345678", "area code in parentheses"],
    ["(021) 1234-5678", "area code in parentheses, number with a dash"],
    ["0251-123456", "three-digit area code with a dash"],
    ["0274.512345", "three-digit area code with a dot"],
    ["+62 21 1234 5678", "international +62 landline"],
    ["+622112345678", "international +62 landline without separators"],
    ["+62 (21) 1234 5678", "international +62, area code in parentheses"],
    ["62-21-1234-5678", "62 landline with dashes"],
    ["62 251 123456", "62 with a three-digit area code"],
    ["021-1234567", "Jakarta landline, seven-digit number, dash"],
    ["(021) 1234 5678", "area code in parentheses, number in two groups"],
    ["+62 21 1234567", "international +62 landline, seven-digit number"],
    ["+62 21 12345678", "the form the pengelola's landline is stored in"],
    ["+62 251 123456", "the stored form with a three-digit area code"],
  ])("removes the landline %s (%s)", (phone) => {
    expect(scrubText(`Telepon kantor ${phone}, jam kerja`)).toBe("Telepon kantor [telepon], jam kerja");
  });

  it("keeps ordinary numbers such as amounts, years and ids", () => {
    const text = "Tagihan TAG-2026-000123 Rp 7500000 jatuh tempo 2026-10-01";
    expect(scrubText(text)).toBe(text);
  });

  it.each([
    ["Rp 1.500.000", "amount with thousand dots"],
    ["Rp 12.025.500.000", "large amount whose groups look like an area code"],
    ["Rp 62.250.000.000", "amount starting with 62"],
    ["Rp 6221000000", "amount starting with 62, no separators"],
    ["Rp1.081.234.567", "amount whose groups look like a mobile number"],
    ["tahun 2026", "year"],
    ["1945-2026", "year range"],
    ["MKM-2026-000123", "Nomor Pemesanan"],
    ["MKM-2026-021234", "Nomor Pemesanan whose serial starts like an area code"],
    ["TGH/2026/000001", "Tagihan number"],
    ["TGH/2026/021234", "Tagihan number whose serial starts like an area code"],
    ["Rp 2.101.234.567", "amount that looks like a +62 21 number"],
    ["Rp 021.234.567", "amount with a leading zero"],
    ["2026-10-01T09:00:00.000Z", "ISO timestamp"],
    ["2026-10-01T09:00:00+07:00", "ISO timestamp with offset"],
    ["2026-10-01 09.30.15 WIB", "date and time with dots"],
    ["3f2a0621-1234-5678-9abc-def012345678", "UUID"],
  ])("leaves %s alone (%s)", (text) => {
    expect(scrubText(`Catatan: ${text}.`)).toBe(`Catatan: ${text}.`);
  });
});

describe("bank account number scrubbing (refund destination, ticket 31)", () => {
  it.each([
    ["7123456789", "10 digits"],
    ["1234567890123456", "16 digits"],
    ["1234 5678 9012 3456", "groups of four with spaces"],
    ["1234-5678-9012", "groups of four with dashes"],
  ])("removes the account %s (%s)", (nomor) => {
    expect(scrubText(`Transfer ke BSI ${nomor} gagal`)).toBe("Transfer ke BSI [rekening] gagal");
  });

  it("removes a NIK (16 digits) like an account number, so a Mitra Jasa's KTP number never reaches Sentry", () => {
    expect(scrubText("NIK 3201014503907777 tidak valid")).toBe("NIK [rekening] tidak valid");
  });

  it("does not turn a mobile number into an account, nor an amount, a date or an id", () => {
    expect(scrubText("hubungi 081234567890")).toBe("hubungi [telepon]");
    const text = "Rp 6221000000 Rp 12.025.500 MKM-2026-021234 2026-10-01";
    expect(scrubText(text)).toBe(text);
  });
});

describe("email address scrubbing (email login, ticket 67)", () => {
  it.each([
    ["sari@contoh.id", "plain"],
    ["Sari.Dewi+makam@Mail.Contoh.co.id", "mixed case, plus tag, subdomains"],
  ])("removes %s (%s)", (email) => {
    expect(scrubText(`Kode Masuk tidak terkirim ke ${email}: 550 mailbox`)).toBe(
      "Kode Masuk tidak terkirim ke [email]: 550 mailbox",
    );
  });

  it("masks the tanda and sampai of a Surat Kuasa render link, so the signed link never reaches Sentry", () => {
    const hasil = scrubText("GET /pengurusan/MKM-2026-000001/surat-kuasa/render?sampai=1790000000000&tanda=AbC_d-9xYz0123456789abcdefABCDEFghijklmnop");
    expect(hasil).not.toContain("AbC_d-9xYz");
    expect(hasil).not.toContain("1790000000000");
    expect(hasil).toContain("/pengurusan/MKM-2026-000001/surat-kuasa/render");
  });

  it("leaves a text without an address alone", () => {
    expect(scrubText("EmailSender (SumoPod SMTP) has no live adapter @ web")).toBe(
      "EmailSender (SumoPod SMTP) has no live adapter @ web",
    );
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

  it("builds the web server's and the worker's options from the validated env", () => {
    const options = serverSentryOptions({
      APP_ENV: "staging",
      SENTRY_DSN: "https://k@glitchtip.makam.co.id/1",
      SENTRY_RELEASE: "abc123",
    });
    expect(options).toMatchObject({
      dsn: "https://k@glitchtip.makam.co.id/1",
      enabled: true,
      environment: "staging",
      release: "abc123",
    });
    expect(options.beforeSend).toBeTypeOf("function");
  });

  it("prefers SENTRY_ENVIRONMENT over APP_ENV", () => {
    expect(serverSentryOptions({ APP_ENV: "production", SENTRY_ENVIRONMENT: "local" }).environment).toBe("local");
  });
});
