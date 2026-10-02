import { randomBytes } from "node:crypto";
import { z } from "zod";
import { verifySvixWebhook } from "@/adapters/shared/svix";
import { RUPIAH_MAX } from "@/lib/rupiah";
import {
  InvalidWebhookError,
  type CreatedPayment,
  type CreatePaymentRequest,
  type PaymentEvent,
  type PaymentEventKind,
  type PaymentProvider,
  type WebhookRequest,
} from "@/ports/payment-provider";

/** SumoPod's Managed Payment sandbox host: v1's beta UAT runs on it (ticket 61, decided 2026-09-26). */
export const SUMOPOD_SANDBOX_BASE_URL = "https://api-pay-sandbox.sumopod.com";
/** SumoPod's Managed Payment live host, installed with live keys on the switch day (ticket 07). */
export const SUMOPOD_LIVE_BASE_URL = "https://api-pay.sumopod.com";

/** SumoPod allows at most 24h and defaults to it; kept explicit rather than relying on the default. */
const EXPIRES_IN_HOURS = 24;
const REQUEST_TIMEOUT_MS = 15_000;

export interface SumopodPaymentProviderOptions {
  /** The project's X-Api-Key. */
  apiKey: string;
  /** The project's Svix signing secret (whsec_...). */
  webhookSecret: string;
  /** `SUMOPOD_SANDBOX_BASE_URL` or `SUMOPOD_LIVE_BASE_URL`, or a test's local stub. */
  baseUrl: string;
  /** Tests only: a `fetch`-compatible function pointed at a local stub instead of the real API. */
  fetchImpl?: typeof fetch;
}

const createPaymentResponseSchema = z.object({
  payment_id: z.string().min(1),
  payment_link_url: z.url(),
  expires_at: z.iso.datetime({ offset: true }),
});

/**
 * SumoPod's Managed Payment QRIS fee: 0.7% of the requested amount plus a flat
 * Rp 300. Probed on the sandbox 2026-10-01 (request 50_000 → fee 650), and the
 * payer is charged requested + fee.
 */
const SUMOPOD_QRIS_RATE = 0.007;
const SUMOPOD_QRIS_FLAT_FEE_RUPIAH = 300;

/** SumoPod's fee before it turns the fraction into whole rupiah (0.7% + Rp 300). */
function exactSumopodFee(requestedRupiah: number): number {
  return requestedRupiah * SUMOPOD_QRIS_RATE + SUMOPOD_QRIS_FLAT_FEE_RUPIAH;
}

/** What SumoPod charges the payer for `requestedRupiah`, under one way of making its fee whole. */
function chargedAmount(requestedRupiah: number, rounding: (value: number) => number): number {
  return requestedRupiah + rounding(exactSumopodFee(requestedRupiah));
}

/**
 * The whole-rupiah amount to ask SumoPod for, so the payer is charged exactly
 * `chargedRupiah` (a Tagihan's total): SumoPod adds its fee ON TOP of the
 * request, so we invert `charged = requested + fee(requested)`, and the
 * Operator nets `requested` (owner decision, 2026-10-01).
 *
 * The fee is monotonic in the requested amount, so a bounded search around the
 * closed form `(chargedRupiah - 300) / 1.007` finds it. SumoPod's rounding of
 * the fractional fee is unconfirmed (the 50_000 probe's fee was already
 * whole); we first look for a requested amount that charges `chargedRupiah`
 * under BOTH `Math.floor` and `Math.round` — its exact fee is below .5, so the
 * result does not depend on the unconfirmed detail. If none exists we assume
 * SumoPod rounds (Math.round) and use the exact amount. If that too is
 * impossible we return the smallest requested amount whose charge is at least
 * `chargedRupiah` (never below), so the Operator is never under-charged.
 */
function sumopodRequestedAmount(chargedRupiah: number): number {
  const centred = Math.round((chargedRupiah - SUMOPOD_QRIS_FLAT_FEE_RUPIAH) / (1 + SUMOPOD_QRIS_RATE));
  const first = Math.max(1, centred - 5);
  const last = Math.max(6, centred + 5);
  const candidates: number[] = [];
  for (let requested = first; requested <= last; requested += 1) candidates.push(requested);

  const robust = candidates.find(
    (requested) =>
      chargedAmount(requested, Math.floor) === chargedRupiah &&
      chargedAmount(requested, Math.round) === chargedRupiah,
  );
  if (robust !== undefined) return robust;

  const rounded = candidates.find((requested) => chargedAmount(requested, Math.round) === chargedRupiah);
  if (rounded !== undefined) return rounded;

  return candidates.find((requested) => chargedAmount(requested, Math.round) >= chargedRupiah) ?? 1;
}

/** SumoPod's `payment_method` is a category, not a bank (ticket 61 research); mapped to a Bukti-friendly label. */
function channelLabel(paymentMethod: string | null | undefined): string | null {
  if (!paymentMethod) return null;
  switch (paymentMethod) {
    case "qris":
      return "QRIS";
    case "bank_transfer":
      return "Virtual Account";
    case "e_wallet":
      return "E-Wallet";
    default:
      return paymentMethod;
  }
}

/** Common fields on every webhook's `data`, whatever the event type (SumoPod ticket 61 research). */
const paymentData = z.object({
  payment_id: z.string().min(1),
  order_id: z.string().min(1),
  amount: z.number().int().nonnegative().max(RUPIAH_MAX),
  payment_method: z.string().min(1).max(100).optional().nullable(),
  /** The moment the customer paid. Never `completed_at` (a T+2 settlement estimate) — see ticket 61's research comment. */
  paid_at: z.iso.datetime({ offset: true }).optional().nullable(),
});

const webhookPayloadSchema = z.discriminatedUnion("event_type", [
  z.object({ event_type: z.literal("payment.completed"), data: paymentData }),
  z.object({ event_type: z.literal("payment.failed"), data: paymentData }),
  z.object({ event_type: z.literal("payment.expired"), data: paymentData }),
  // The Settings "Save & Test" button: no Tagihan is behind it, answered 2xx and ignored.
  z.object({ event_type: z.literal("payment.test"), data: z.unknown().optional() }),
]);

const EVENT_KIND: Record<"payment.completed" | "payment.failed" | "payment.expired", PaymentEventKind> = {
  "payment.completed": "paid",
  "payment.failed": "failed",
  "payment.expired": "expired",
};

/**
 * The live PaymentProvider: SumoPod's Managed Payment API. QRIS only in v1
 * (no Virtual Account); no payout, refund or status-lookup endpoint exists in
 * the public API, so the webhook is the only source of truth. SumoPod has no
 * public docs site — see ticket 61's 2026-09-26 research comment for every
 * fact this adapter relies on (endpoints, field names, the Svix scheme).
 */
export class SumopodPaymentProvider implements PaymentProvider {
  readonly #apiKey: string;
  readonly #webhookSecret: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;

  constructor(options: SumopodPaymentProviderOptions) {
    this.#apiKey = options.apiKey;
    this.#webhookSecret = options.webhookSecret;
    this.#baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.#fetch = options.fetchImpl ?? fetch;
  }

  async createPayment(request: CreatePaymentRequest): Promise<CreatedPayment> {
    if (!Number.isInteger(request.amountRupiah)) {
      // The old app rounded fractional amounts instead of refusing them (ticket 61's lessons); refuse instead.
      throw new Error("SumoPod requires a whole-rupiah amount");
    }
    const response = await this.#fetch(`${this.#baseUrl}/api/v1/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": this.#apiKey },
      body: JSON.stringify({
        order_id: uniqueOrderId(request.reference),
        // SumoPod adds its fee on top of this, so send less than the Tagihan total: the payer is charged exactly it, the Operator nets the rest.
        amount: sumopodRequestedAmount(request.amountRupiah),
        currency: "IDR",
        expires_in_hours: EXPIRES_IN_HOURS,
        // v1 takes QRIS only (Bank Indonesia's Rp 10 juta cap; no Virtual Account, decided 2026-09-26).
        payment_method_type_code: "QRIS",
        ...(request.returnUrl ? { success_return_url: request.returnUrl, cancel_return_url: request.returnUrl } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      // Never include the response body: it could echo back request fields, and there is no guessed-endpoint risk here.
      throw new Error(`SumoPod createPayment failed with status ${response.status}`);
    }
    const json = await response.json().catch(() => undefined);
    const parsed = createPaymentResponseSchema.safeParse(json);
    if (!parsed.success) throw new Error("SumoPod createPayment returned an unexpected shape");
    return {
      providerPaymentId: parsed.data.payment_id,
      paymentUrl: parsed.data.payment_link_url,
      expiresAt: new Date(parsed.data.expires_at),
    };
  }

  async parseWebhook(request: WebhookRequest): Promise<PaymentEvent | null> {
    verifySvixWebhook(this.#webhookSecret, request);
    let json: unknown;
    try {
      json = JSON.parse(request.rawBody);
    } catch {
      throw new InvalidWebhookError("Webhook body is not JSON");
    }
    const parsed = webhookPayloadSchema.safeParse(json);
    if (!parsed.success) throw new InvalidWebhookError("Webhook payload has an unexpected shape");
    const eventId = Object.entries(request.headers).find(([name]) => name.toLowerCase() === "svix-id")?.[1];
    if (!eventId) throw new InvalidWebhookError("Webhook has no svix-id");

    if (parsed.data.event_type === "payment.test") return null;

    const { event_type, data } = parsed.data;
    if (event_type === "payment.completed" && !data.paid_at) {
      throw new InvalidWebhookError("A completed payment webhook has no paid_at");
    }
    return {
      eventId,
      kind: EVENT_KIND[event_type],
      providerPaymentId: data.payment_id,
      reference: data.order_id,
      amountRupiah: data.amount,
      channel: channelLabel(data.payment_method),
      // Only "paid" events reach the Tagihan's late-payment judgement; the others' paidAt is never read.
      paidAt: data.paid_at ? new Date(data.paid_at) : new Date(),
    };
  }
}

/**
 * A fresh order_id per created payment, from the Tagihan's reference.
 * Whether SumoPod requires order_id to be unique is unconfirmed (ticket 61's
 * research, open question 1), so every call plays it safe: Bayar re-creating
 * an expired link, or two live links on one Tagihan, never sends the same
 * order_id twice (the makam-app lesson: reusing one order reference risked a
 * double payment caught only at settlement).
 */
function uniqueOrderId(reference: string): string {
  const safe = reference.replace(/[^A-Za-z0-9_-]/g, "-").slice(0, 80);
  return `${safe}-${randomBytes(4).toString("hex")}`;
}
