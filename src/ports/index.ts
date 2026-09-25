/**
 * Adapter ports (spec: Implementation Decisions > Adapter ports; story 185).
 *
 * Every outside dependency sits behind one of these interfaces, each with a
 * live implementation (src/adapters/live) and an in-memory fake that records
 * what it received (src/adapters/memory). Domain modules depend on these
 * interfaces only; the composition root (src/composition) picks the
 * implementation per environment.
 */
export type { Clock } from "./clock";
export type { EmailSender } from "./email-sender";
export type { FileStore } from "./file-store";
export type { PaymentProvider } from "./payment-provider";
export type { PdfRenderer } from "./pdf-renderer";
export type { SmsSender } from "./sms-sender";
export type { WebPush } from "./web-push";
export type { WhatsAppSender } from "./whatsapp-sender";

import type { Clock } from "./clock";
import type { EmailSender } from "./email-sender";
import type { FileStore } from "./file-store";
import type { PaymentProvider } from "./payment-provider";
import type { PdfRenderer } from "./pdf-renderer";
import type { SmsSender } from "./sms-sender";
import type { WebPush } from "./web-push";
import type { WhatsAppSender } from "./whatsapp-sender";

/** Everything a domain module may need from the outside world. */
export interface Adapters {
  clock: Clock;
  payments: PaymentProvider;
  whatsapp: WhatsAppSender;
  email: EmailSender;
  sms: SmsSender;
  webPush: WebPush;
  files: FileStore;
  pdf: PdfRenderer;
}
