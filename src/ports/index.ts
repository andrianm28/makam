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
export type { WebPush } from "./web-push";

import type { Clock } from "./clock";
import type { EmailSender } from "./email-sender";
import type { FileStore } from "./file-store";
import type { PaymentProvider } from "./payment-provider";
import type { PdfRenderer } from "./pdf-renderer";
import type { WebPush } from "./web-push";

/** Everything a domain module may need from the outside world. */
export interface Adapters {
  clock: Clock;
  payments: PaymentProvider;
  email: EmailSender;
  webPush: WebPush;
  files: FileStore;
  pdf: PdfRenderer;
}
