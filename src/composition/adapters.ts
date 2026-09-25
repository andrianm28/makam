import { notConfigured } from "@/adapters/live/not-configured";
import { SystemClock } from "@/adapters/live/system-clock";
import { createMemoryAdapters } from "@/adapters/memory";
import type { AppEnvironment } from "@/lib/env";
import type { Adapters } from "@/ports";
import type { EmailSender } from "@/ports/email-sender";
import type { FileStore } from "@/ports/file-store";
import type { PaymentProvider } from "@/ports/payment-provider";
import type { PdfRenderer } from "@/ports/pdf-renderer";
import type { SmsSender } from "@/ports/sms-sender";
import type { WebPush } from "@/ports/web-push";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";

export interface AdapterOptions {
  appEnv: AppEnvironment;
  /** Svix secret for the fake PaymentProvider's webhooks (non-production only). */
  fakePaymentWebhookSecret?: string;
  /** Replace individual adapters, e.g. a test's FakeClock. */
  overrides?: Partial<Adapters>;
}

/**
 * The composition root for adapters: the one place that decides real or fake.
 *
 * - production: live adapters. Ports whose live adapter is not built yet reject
 *   every call (PortNotConfiguredError) rather than silently faking.
 * - development, test, staging: the system Clock plus in-memory fakes for every
 *   outbound port, so nothing leaves the machine.
 */
export function createAdapters(options: AdapterOptions): Adapters {
  const clock = options.overrides?.clock ?? new SystemClock();

  const base: Adapters =
    options.appEnv === "production"
      ? {
          clock,
          payments: notConfigured<PaymentProvider>("PaymentProvider (SumoPod)"),
          whatsapp: notConfigured<WhatsAppSender>("WhatsAppSender (kirim.dev)"),
          email: notConfigured<EmailSender>("EmailSender (SES)"),
          sms: notConfigured<SmsSender>("SmsSender (Zenziva)"),
          webPush: notConfigured<WebPush>("WebPush"),
          files: notConfigured<FileStore>("FileStore (S3)"),
          pdf: notConfigured<PdfRenderer>("PdfRenderer"),
        }
      : createMemoryAdapters(clock, { paymentWebhookSecret: options.fakePaymentWebhookSecret });

  return { ...base, ...options.overrides };
}
