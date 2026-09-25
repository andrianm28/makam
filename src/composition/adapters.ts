import { notConfigured } from "@/adapters/live/not-configured";
import { SmtpEmailSender } from "@/adapters/live/smtp-email-sender";
import { SystemClock } from "@/adapters/live/system-clock";
import { VapidWebPush } from "@/adapters/live/vapid-web-push";
import { createMemoryAdapters } from "@/adapters/memory";
import { usesInMemoryFakes, type AppEnvironment, type SmtpSettings } from "@/lib/env";
import type { Adapters } from "@/ports";
import type { EmailSender } from "@/ports/email-sender";
import type { FileStore } from "@/ports/file-store";
import type { PaymentProvider } from "@/ports/payment-provider";
import type { PdfRenderer } from "@/ports/pdf-renderer";
import type { WebPush } from "@/ports/web-push";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";

export interface AdapterOptions {
  appEnv: AppEnvironment;
  /** Svix secret for the fake PaymentProvider's webhooks (development and test only; ignored elsewhere). */
  fakePaymentWebhookSecret?: string;
  /** The SumoPod SMTP relay for the live EmailSender (`env.smtp`); ignored in development and test. */
  smtp?: SmtpSettings;
  /** VAPID key pair and subject for the live WebPush (from the validated env; ignored where fakes run). */
  vapid?: { publicKey: string; privateKey: string; subject: string };
  /** Replace individual adapters, e.g. a test's FakeClock. */
  overrides?: Partial<Adapters>;
}

/**
 * The composition root for adapters: the one place that decides real or fake.
 *
 * - development, test: the system Clock plus in-memory fakes for every
 *   outbound port, so nothing leaves the machine.
 * - staging, production: wired identically, live adapters only (staging gets
 *   sandbox credentials, e.g. SumoPod sandbox from ticket 61). EmailSender is
 *   the SumoPod SMTP relay (ticket 68; `smtp` from the validated env). Ports whose live
 *   adapter is not configured reject every call (PortNotConfiguredError) rather
 *   than silently faking.
 */
export function createAdapters(options: AdapterOptions): Adapters {
  const clock = options.overrides?.clock ?? new SystemClock();

  const base: Adapters = usesInMemoryFakes(options.appEnv)
    ? createMemoryAdapters(clock, { paymentWebhookSecret: options.fakePaymentWebhookSecret })
    : {
        clock,
        payments: notConfigured<PaymentProvider>("PaymentProvider (SumoPod)"),
        whatsapp: notConfigured<WhatsAppSender>("WhatsAppSender (kirim.dev)"),
        email: options.smtp
          ? new SmtpEmailSender(options.smtp)
          : notConfigured<EmailSender>("EmailSender (SumoPod SMTP)"),
        webPush: options.vapid ? new VapidWebPush({ ...options.vapid, clock }) : notConfigured<WebPush>("WebPush"),
        files: notConfigured<FileStore>("FileStore (S3)"),
        pdf: notConfigured<PdfRenderer>("PdfRenderer"),
      };

  return { ...base, ...options.overrides };
}
