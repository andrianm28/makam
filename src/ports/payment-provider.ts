/**
 * PaymentProvider port (SumoPod in v1).
 *
 * - Creates a payment for a Tagihan when the payer clicks Bayar, and is asked
 *   again for a new one if the link expired. The platform's own due date is
 *   independent of the link's expiry.
 * - Verifies (Svix signature) and parses webhooks. Billing processes them
 *   idempotently by `eventId`.
 * - No payout or refund methods in v1.
 */
export interface CreatePaymentRequest {
  /** Our reference for the payment, e.g. the Tagihan number. */
  reference: string;
  /** Whole rupiah. */
  amountRupiah: number;
  description: string;
  payer?: { name?: string; phone?: string; email?: string };
  /** Where the provider sends the payer back to after paying. */
  returnUrl?: string;
}

export interface CreatedPayment {
  providerPaymentId: string;
  paymentUrl: string;
  /** When the provider's link stops working. */
  expiresAt: Date;
}

export interface WebhookRequest {
  /** The exact bytes received; the signature is over these. */
  rawBody: string;
  headers: Record<string, string>;
}

export type PaymentEventKind = "paid" | "expired" | "failed";

export interface PaymentEvent {
  /** Unique per delivery attempt group (Svix message id); the idempotency key. */
  eventId: string;
  kind: PaymentEventKind;
  providerPaymentId: string;
  reference: string;
  amountRupiah: number;
  /** What the payer paid with, as the provider names it (e.g. "QRIS", "VA BCA"), when it says. */
  channel: string | null;
  /**
   * When the payer paid, as the provider reports it. Never the settlement
   * time (SumoPod's `completed_at`/`settled_at`, T+2): late-payment judgement
   * (`paidAt` vs a Tagihan's `dueAt`) needs the moment of payment.
   */
  paidAt: Date;
}

export class InvalidWebhookError extends Error {
  constructor(message = "Webhook signature or payload is invalid") {
    super(message);
    this.name = "InvalidWebhookError";
  }
}

export interface PaymentProvider {
  createPayment(request: CreatePaymentRequest): Promise<CreatedPayment>;
  /**
   * Throws InvalidWebhookError when the signature or payload does not check
   * out. Returns null for a delivery that carries no payment event to act on
   * (e.g. SumoPod's Settings "Save & Test" ping): the caller acknowledges it
   * with 2xx and records nothing.
   */
  parseWebhook(request: WebhookRequest): Promise<PaymentEvent | null>;
}
