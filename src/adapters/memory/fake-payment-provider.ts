import { randomUUID } from "node:crypto";
import { z } from "zod";
import { signSvixWebhook, verifySvixWebhook } from "@/adapters/shared/svix";
import type { Clock } from "@/ports/clock";
import {
  InvalidWebhookError,
  type CreatedPayment,
  type CreatePaymentRequest,
  type PaymentEvent,
  type PaymentEventKind,
  type PaymentProvider,
  type WebhookRequest,
} from "@/ports/payment-provider";

/** A fixed test secret in Svix format. Never used outside fakes. */
export const FAKE_PAYMENT_WEBHOOK_SECRET =
  "whsec_" + Buffer.from("makam-fake-payment-webhook-secret").toString("base64");

const LINK_VALID_MS = 24 * 60 * 60 * 1000;

const webhookPayload = z.object({
  type: z.enum(["payment.paid", "payment.expired", "payment.failed"]),
  data: z.object({
    payment_id: z.string(),
    reference: z.string(),
    amount: z.number().int().nonnegative(),
    channel: z.string().min(1).max(100).optional(),
    occurred_at: z.iso.datetime({ offset: true }),
  }),
});

export interface RecordedPayment extends CreatePaymentRequest, CreatedPayment {}

/**
 * In-memory PaymentProvider. Records every payment created and can emit
 * Svix-signed webhook payloads for them, which `parseWebhook` (like the live
 * adapter) verifies before trusting.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly created: RecordedPayment[] = [];
  readonly #clock: Clock;
  readonly #secret: string;

  constructor(options: { clock: Clock; webhookSecret?: string }) {
    this.#clock = options.clock;
    this.#secret = options.webhookSecret ?? FAKE_PAYMENT_WEBHOOK_SECRET;
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatedPayment> {
    const providerPaymentId = `fakepay_${randomUUID()}`;
    const payment: CreatedPayment = {
      providerPaymentId,
      paymentUrl: `https://pay.fake.local/${providerPaymentId}`,
      expiresAt: new Date(this.#clock.now().getTime() + LINK_VALID_MS),
    };
    this.created.push({ ...request, ...payment });
    return payment;
  }

  /** A signed webhook for a payment this fake created, as the provider would POST it. */
  webhookFor(
    providerPaymentId: string,
    kind: PaymentEventKind,
    options: { occurredAt?: Date; eventId?: string; channel?: string; amountRupiah?: number } = {},
  ): WebhookRequest {
    const payment = this.created.find((p) => p.providerPaymentId === providerPaymentId);
    if (!payment) throw new Error(`FakePaymentProvider did not create ${providerPaymentId}`);
    const body = JSON.stringify({
      type: `payment.${kind}`,
      data: {
        payment_id: payment.providerPaymentId,
        reference: payment.reference,
        amount: options.amountRupiah ?? payment.amountRupiah,
        channel: options.channel ?? "QRIS",
        occurred_at: (options.occurredAt ?? this.#clock.now()).toISOString(),
      },
    });
    return signSvixWebhook(this.#secret, options.eventId ?? `msg_${randomUUID()}`, body);
  }

  async parseWebhook(request: WebhookRequest): Promise<PaymentEvent> {
    verifySvixWebhook(this.#secret, request);
    let json: unknown;
    try {
      json = JSON.parse(request.rawBody);
    } catch {
      throw new InvalidWebhookError("Webhook body is not JSON");
    }
    const parsed = webhookPayload.safeParse(json);
    if (!parsed.success) throw new InvalidWebhookError("Webhook payload has an unexpected shape");
    const eventId = Object.entries(request.headers).find(([k]) => k.toLowerCase() === "svix-id")?.[1];
    if (!eventId) throw new InvalidWebhookError("Webhook has no svix-id");

    const { type, data } = parsed.data;
    return {
      eventId,
      kind: type.slice("payment.".length) as PaymentEventKind,
      providerPaymentId: data.payment_id,
      reference: data.reference,
      amountRupiah: data.amount,
      channel: data.channel ?? null,
      occurredAt: new Date(data.occurred_at),
    };
  }
}
