import { describe, expect, it } from "vitest";
import { SystemClock } from "@/adapters/live/system-clock";
import {
  FakeEmailSender,
  FakeFileStore,
  FakePaymentProvider,
  FakePdfRenderer,
  FakeWebPush,
  FakeWhatsAppSender,
} from "@/adapters/memory";
import { ChromiumPdfRenderer } from "@/adapters/live/chromium-pdf-renderer";
import { PortNotConfiguredError } from "@/adapters/live/not-configured";
import { SmtpEmailSender } from "@/adapters/live/smtp-email-sender";
import type { SmtpSettings } from "@/lib/env";
import { VapidWebPush } from "@/adapters/live/vapid-web-push";
import type { Adapters } from "@/ports";
import { createAdapters } from "./adapters";

const WEBHOOK_SECRET = "whsec_c2VjcmV0LWZvci10ZXN0cw==";

function expectNoFakes(adapters: Adapters) {
  expect(adapters.payments).not.toBeInstanceOf(FakePaymentProvider);
  expect(adapters.whatsapp).not.toBeInstanceOf(FakeWhatsAppSender);
  expect(adapters.email).not.toBeInstanceOf(FakeEmailSender);
  expect(adapters.webPush).not.toBeInstanceOf(FakeWebPush);
  expect(adapters.files).not.toBeInstanceOf(FakeFileStore);
  expect(adapters.pdf).not.toBeInstanceOf(FakePdfRenderer);
}

describe("composition root", () => {
  const VAPID = {
    publicKey: "BI9GUoKHw9z_J777Fi5TjIhzfL2qIT1Mwt43yL-4ClEIJe4nqMPuqV6N4fhPf0H0HElivGiE4yiJ63gf5uyry40",
    privateKey: "Xpgeqwz12bqNco2x4H5dpW57Hqrr1zVY6ift2jx5YYc",
    subject: "mailto:ops@makam.co.id",
  };

  it.each(["development", "test"] as const)("wires the in-memory fakes in %s", (appEnv) => {
    const adapters = createAdapters({ appEnv });

    expect(adapters.clock).toBeInstanceOf(SystemClock);
    expect(adapters.payments).toBeInstanceOf(FakePaymentProvider);
    expect(adapters.whatsapp).toBeInstanceOf(FakeWhatsAppSender);
  });

  it.each(["staging", "production"] as const)(
    "never wires a fake in %s: a port without a live adapter refuses to run",
    async (appEnv) => {
      const adapters = createAdapters({ appEnv, vapid: VAPID });

      expect(adapters.clock).toBeInstanceOf(SystemClock);
      expectNoFakes(adapters);
      await expect(
        adapters.whatsapp.sendTemplate({ to: "+6281234567890", template: "t", language: "id", parameters: [] }),
      ).rejects.toBeInstanceOf(PortNotConfiguredError);
      await expect(
        adapters.payments.createPayment({ reference: "TAG-1", amountRupiah: 1, description: "x" }),
      ).rejects.toBeInstanceOf(PortNotConfiguredError);
    },
  );

  it.each(["staging", "production"] as const)(
    "a fake payment webhook secret does not bring the fake PaymentProvider back in %s",
    async (appEnv) => {
      const adapters = createAdapters({ appEnv, vapid: VAPID, fakePaymentWebhookSecret: WEBHOOK_SECRET });

      expect(adapters.payments).not.toBeInstanceOf(FakePaymentProvider);
      await expect(
        adapters.payments.createPayment({ reference: "TAG-1", amountRupiah: 1, description: "x" }),
      ).rejects.toBeInstanceOf(PortNotConfiguredError);
    },
  );

  const SMTP: SmtpSettings = {
    host: "smtp.sumopod.com",
    port: 465,
    user: "v1-user",
    password: "v1-password",
    from: { address: "no-reply@makam.co.id", name: "Makam.co.id" },
  };

  it.each(["staging", "production"] as const)("sends email through the SumoPod SMTP relay in %s", (appEnv) => {
    expect(createAdapters({ appEnv, vapid: VAPID, smtp: SMTP }).email).toBeInstanceOf(SmtpEmailSender);
  });

  it.each(["staging", "production"] as const)(
    "without SMTP settings the EmailSender refuses to send in %s, never faking it",
    async (appEnv) => {
      const { email } = createAdapters({ appEnv, vapid: VAPID });
      await expect(email.send({ to: "a@example.test", subject: "x", text: "x" })).rejects.toThrow(
        /EmailSender \(SumoPod SMTP\)/,
      );
    },
  );

  it.each(["development", "test"] as const)("keeps the fake EmailSender in %s even with SMTP settings", (appEnv) => {
    expect(createAdapters({ appEnv, smtp: SMTP }).email).toBeInstanceOf(FakeEmailSender);
  });


  it.each(["staging", "production"] as const)("wires the live VAPID WebPush for staff push in %s", (appEnv) => {
    expect(createAdapters({ appEnv, vapid: VAPID }).webPush).toBeInstanceOf(VapidWebPush);
  });

  it.each(["staging", "production"] as const)(
    "refuses to compose without the VAPID keys in %s (a type error, and loud at run time)",
    (appEnv) => {
      // @ts-expect-error staging and production must be given the VAPID keys
      expect(() => createAdapters({ appEnv })).toThrow(/VAPID keys are required in/);
    },
  );

  it.each(["development", "test"] as const)("keeps the fake WebPush in %s, even with VAPID keys", (appEnv) => {
    expect(createAdapters({ appEnv, vapid: VAPID }).webPush).toBeInstanceOf(FakeWebPush);
  });

  it.each(["staging", "production"] as const)("renders PDFs with the image's headless Chromium in %s", (appEnv) => {
    expect(createAdapters({ appEnv, vapid: VAPID }).pdf).toBeInstanceOf(ChromiumPdfRenderer);
  });

  it.each(["development", "test"] as const)("keeps the fake PdfRenderer in %s", (appEnv) => {
    expect(createAdapters({ appEnv }).pdf).toBeInstanceOf(FakePdfRenderer);
  });

  it("lets a test inject its own Clock and fakes", () => {
    const whatsapp = new FakeWhatsAppSender();
    const adapters = createAdapters({ appEnv: "test", overrides: { whatsapp } });
    expect(adapters.whatsapp).toBe(whatsapp);
  });
});
