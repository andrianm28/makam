import { ChromiumPdfRenderer } from "@/adapters/live/chromium-pdf-renderer";
import { notConfigured } from "@/adapters/live/not-configured";
import { SmtpEmailSender } from "@/adapters/live/smtp-email-sender";
import { SumopodPaymentProvider } from "@/adapters/live/sumopod-payment-provider";
import { SystemClock } from "@/adapters/live/system-clock";
import { VapidWebPush } from "@/adapters/live/vapid-web-push";
import { createMemoryAdapters } from "@/adapters/memory";
import {
  DEFAULT_CHROMIUM_PATH,
  usesInMemoryFakes,
  type AppEnvironment,
  type SmtpSettings,
  type SumopodSettings,
  type VapidKeys,
} from "@/lib/env";
import type { Adapters } from "@/ports";
import type { EmailSender } from "@/ports/email-sender";
import type { FileStore } from "@/ports/file-store";
import type { PaymentProvider } from "@/ports/payment-provider";

interface CommonAdapterOptions {
  /** Svix secret for the fake PaymentProvider's webhooks (development and test only; ignored elsewhere). */
  fakePaymentWebhookSecret?: string;
  /** The SumoPod SMTP relay for the live EmailSender (`env.smtp`); ignored in development and test. */
  smtp?: SmtpSettings;
  /** The SumoPod project for the live PaymentProvider (`env.sumopod`); ignored in development and test. */
  sumopod?: SumopodSettings;
  /** The headless Chromium the live PdfRenderer runs (`env.CHROMIUM_PATH`); ignored in development and test. */
  chromiumPath?: string;
  /** Replace individual adapters, e.g. a test's FakeClock. */
  overrides?: Partial<Adapters>;
}

/**
 * Staging and production must be given the VAPID keys for the live WebPush
 * (`env.vapid`, which env validation requires there); development and test
 * ignore them and keep the fake.
 */
export type AdapterOptions = CommonAdapterOptions &
  (
    | { appEnv: Extract<AppEnvironment, "development" | "test">; vapid?: VapidKeys }
    | { appEnv: Extract<AppEnvironment, "staging" | "production">; vapid: VapidKeys }
  );

/**
 * The composition root for adapters: the one place that decides real or fake.
 *
 * - development, test: the system Clock plus in-memory fakes for every
 *   outbound port, so nothing leaves the machine.
 * - staging, production: wired identically, live adapters only. PaymentProvider
 *   is SumoPod's Managed Payment API (ticket 61; `sumopod` from the validated
 *   env — staging holds sandbox keys, production live ones from the switch
 *   day). EmailSender is the SumoPod SMTP relay (ticket 68; `smtp` from the
 *   validated env). Ports whose live adapter is not configured reject every
 *   call (PortNotConfiguredError) rather than silently faking.
 */
export function createAdapters(options: AdapterOptions): Adapters {
  const clock = options.overrides?.clock ?? new SystemClock();

  const base: Adapters = usesInMemoryFakes(options.appEnv)
    ? createMemoryAdapters(clock, { paymentWebhookSecret: options.fakePaymentWebhookSecret })
    : {
        clock,
        payments: options.sumopod
          ? new SumopodPaymentProvider(options.sumopod)
          : notConfigured<PaymentProvider>("PaymentProvider (SumoPod)"),
        email: options.smtp
          ? new SmtpEmailSender(options.smtp)
          : notConfigured<EmailSender>("EmailSender (SumoPod SMTP)"),
        webPush: new VapidWebPush({ ...requiredVapid(options), clock }),
        files: notConfigured<FileStore>("FileStore (S3)"),
        pdf: new ChromiumPdfRenderer({ executablePath: options.chromiumPath ?? DEFAULT_CHROMIUM_PATH }),
      };

  return { ...base, ...options.overrides };
}

/** The VAPID keys; the type demands them in staging and production, and a caller that got round it fails here. */
function requiredVapid(options: AdapterOptions): VapidKeys {
  if (!options.vapid) throw new Error(`VAPID keys are required in ${options.appEnv}`);
  return options.vapid;
}
