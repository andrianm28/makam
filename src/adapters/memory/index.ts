export { FakeClock, durationMs, type Duration } from "./fake-clock";
export { FakeFileStore, FakePdfRenderer } from "./fake-files";
export {
  FAKE_PAYMENT_WEBHOOK_SECRET,
  FakePaymentProvider,
  type RecordedPayment,
} from "./fake-payment-provider";
export { FakeEmailSender, FakeWebPush } from "./fake-senders";

import type { Adapters } from "@/ports";
import type { Clock } from "@/ports/clock";
import { FakeFileStore, FakePdfRenderer } from "./fake-files";
import { FakePaymentProvider } from "./fake-payment-provider";
import { FakeEmailSender, FakeWebPush } from "./fake-senders";

export interface MemoryAdapters extends Adapters {
  payments: FakePaymentProvider;
  email: FakeEmailSender;
  webPush: FakeWebPush;
  files: FakeFileStore;
  pdf: FakePdfRenderer;
}

/** A full set of fakes around the given Clock, for tests and non-production runs. */
export function createMemoryAdapters<C extends Clock>(
  clock: C,
  options: { paymentWebhookSecret?: string } = {},
): MemoryAdapters & { clock: C } {
  return {
    clock,
    payments: new FakePaymentProvider({ clock, webhookSecret: options.paymentWebhookSecret }),
    email: new FakeEmailSender(),
    webPush: new FakeWebPush(),
    files: new FakeFileStore({ clock }),
    pdf: new FakePdfRenderer(),
  };
}
