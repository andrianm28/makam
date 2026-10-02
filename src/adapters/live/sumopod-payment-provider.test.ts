import { createServer, type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { Webhook } from "svix";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { signSvixWebhook } from "@/adapters/shared/svix";
import { InvalidWebhookError, type WebhookRequest } from "@/ports/payment-provider";
import { SumopodPaymentProvider } from "./sumopod-payment-provider";

/** Never the real sandbox: a local stand-in for SumoPod's Managed Payment API. */
const API_KEY = "test-sumopod-api-key";
const WEBHOOK_SECRET = "whsec_" + Buffer.from("sumopod-test-secret-32-bytes-ok").toString("base64");

interface ReceivedRequest {
  method: string;
  path: string;
  headers: IncomingHttpHeaders;
  body: unknown;
}

class StandInSumopod {
  readonly requests: ReceivedRequest[] = [];
  nextStatus = 200;
  nextBody: unknown = {};
  #server?: Server;
  origin = "";

  async start() {
    this.#server = createServer((request, response) => this.#handle(request, response));
    await new Promise<void>((resolve) => this.#server!.listen(0, "127.0.0.1", resolve));
    this.origin = `http://127.0.0.1:${(this.#server!.address() as AddressInfo).port}`;
  }

  async stop() {
    await new Promise((resolve) => this.#server?.close(resolve));
  }

  #handle(request: IncomingMessage, response: ServerResponse) {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      let body: unknown = raw;
      try {
        body = raw ? JSON.parse(raw) : undefined;
      } catch {
        // keep the raw text; no test sends a non-JSON body on purpose
      }
      this.requests.push({ method: request.method ?? "", path: request.url ?? "", headers: request.headers, body });
      response.statusCode = this.nextStatus;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify(this.nextBody));
    });
  }
}

function respondCreated(service: StandInSumopod, overrides: Record<string, unknown> = {}) {
  service.nextStatus = 200;
  service.nextBody = {
    payment_id: "11111111-1111-1111-1111-111111111111",
    order_id: "ignored-by-the-adapter",
    amount: 150_000,
    fee: 1_500,
    net_amount: 148_500,
    payment_link_url: "https://pay.sumopod.com/pay/11111111-1111-1111-1111-111111111111",
    status: "pending",
    expires_at: "2026-10-02T09:00:00Z",
    ...overrides,
  };
}

/**
 * SumoPod's QRIS fee, as the adapter must assume it: 0.7% of the requested
 * amount rounded to whole rupiah, plus Rp 300 (probe 2026-10-01). SumoPod adds
 * this ON TOP of the requested amount, so the payer is charged `R + fee(R)`.
 */
function sumopodFee(requestedRupiah: number): number {
  return Math.round(requestedRupiah * 0.007) + 300;
}

function adapterFor(service: StandInSumopod, options: { webhookSecret?: string } = {}) {
  return new SumopodPaymentProvider({
    apiKey: API_KEY,
    webhookSecret: options.webhookSecret ?? WEBHOOK_SECRET,
    baseUrl: service.origin,
  });
}

describe("SumoPod PaymentProvider: createPayment (local stub, never the real sandbox)", () => {
  let service: StandInSumopod;
  beforeEach(async () => {
    service = new StandInSumopod();
    await service.start();
  });
  afterEach(() => service.stop());

  it("posts to /api/v1/payments with the X-Api-Key, QRIS and a unique order_id, mapped from the response", async () => {
    respondCreated(service);

    const created = await adapterFor(service).createPayment({
      reference: "TGH/2026/000001",
      amountRupiah: 150_000,
      description: "Tagihan TGH/2026/000001 · Makam.co.id",
      returnUrl: "https://makam.co.id/dokumen/abcdef",
    });

    expect(created).toEqual({
      providerPaymentId: "11111111-1111-1111-1111-111111111111",
      paymentUrl: "https://pay.sumopod.com/pay/11111111-1111-1111-1111-111111111111",
      expiresAt: new Date("2026-10-02T09:00:00Z"),
    });
    expect(service.requests).toHaveLength(1);
    const [request] = service.requests;
    expect(request.method).toBe("POST");
    expect(request.path).toBe("/api/v1/payments");
    expect(request.headers["x-api-key"]).toBe(API_KEY);
    expect(request.body).toMatchObject({
      // Rp 148_659 + SumoPod's fee of Rp 1_341 charges the payer exactly the Rp 150_000 Tagihan (Operator bears the fee).
      amount: 148_659,
      currency: "IDR",
      expires_in_hours: 24,
      payment_method_type_code: "QRIS",
      success_return_url: "https://makam.co.id/dokumen/abcdef",
      cancel_return_url: "https://makam.co.id/dokumen/abcdef",
    });
    expect((request.body as { order_id: string }).order_id).toMatch(/^TGH-2026-000001-[0-9a-f]{8}$/);
  });

  it.each([50_000, 100_000, 150_000, 1_000_000])(
    "asks SumoPod for an amount whose charge is exactly the Rp %i Tagihan total; the Operator bears the fee",
    async (total) => {
      respondCreated(service);

      await adapterFor(service).createPayment({ reference: "TGH-1", amountRupiah: total, description: "x" });

      const sent = (service.requests[0].body as { amount: number }).amount;
      expect(sent).toBeLessThan(total);
      expect(sent + sumopodFee(sent)).toBe(total);
    },
  );

  it("gives every created payment a different order_id, even for the same Tagihan (re-created after expiry)", async () => {
    respondCreated(service);
    const adapter = adapterFor(service);

    await adapter.createPayment({ reference: "TGH/2026/000002", amountRupiah: 1_000, description: "x" });
    await adapter.createPayment({ reference: "TGH/2026/000002", amountRupiah: 1_000, description: "x" });

    const orderIds = service.requests.map((request) => (request.body as { order_id: string }).order_id);
    expect(new Set(orderIds).size).toBe(2);
  });

  it("refuses a fractional amount instead of rounding it", async () => {
    respondCreated(service);

    await expect(
      adapterFor(service).createPayment({ reference: "TGH-1", amountRupiah: 1_000.5, description: "x" }),
    ).rejects.toThrow(/whole-rupiah/);
    expect(service.requests).toEqual([]);
  });

  it("throws (naming only the status, no response body) when SumoPod refuses the request", async () => {
    service.nextStatus = 401;
    service.nextBody = { message: "unauthorized", api_key: API_KEY };

    const failure: unknown = await adapterFor(service)
      .createPayment({ reference: "TGH-1", amountRupiah: 1_000, description: "x" })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as Error).message).toContain("401");
    expect((failure as Error).message).not.toContain(API_KEY);
  });

  it("throws when SumoPod's response has an unexpected shape", async () => {
    service.nextStatus = 200;
    service.nextBody = { ok: true };

    await expect(
      adapterFor(service).createPayment({ reference: "TGH-1", amountRupiah: 1_000, description: "x" }),
    ).rejects.toThrow(/unexpected shape/);
  });
});

describe("SumoPod PaymentProvider: parseWebhook (Svix-signed sample payloads, never the real sandbox)", () => {
  function completedBody(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      event_type: "payment.completed",
      data: {
        payment_id: "11111111-1111-1111-1111-111111111111",
        order_id: "TGH-2026-000001-abcd1234",
        amount: 150_000,
        fee: 1_500,
        net_amount: 148_500,
        status: "completed",
        payment_method: "qris",
        paid_at: "2026-10-01T09:15:00Z",
        settled_at: "2026-10-03T09:15:00Z",
        completed_at: "2026-10-03T09:15:00Z",
        ...overrides,
      },
    });
  }

  const adapter = new SumopodPaymentProvider({ apiKey: API_KEY, webhookSecret: WEBHOOK_SECRET, baseUrl: "https://unused.example" });

  it("maps a signed 'payment.completed' webhook to a 'paid' event, using paid_at (never completed_at/settled_at)", async () => {
    const webhook = signSvixWebhook(WEBHOOK_SECRET, "msg_1", completedBody());

    const event = await adapter.parseWebhook(webhook);

    expect(event).toEqual({
      eventId: "msg_1",
      kind: "paid",
      providerPaymentId: "11111111-1111-1111-1111-111111111111",
      reference: "TGH-2026-000001-abcd1234",
      amountRupiah: 150_000,
      channel: "QRIS",
      paidAt: new Date("2026-10-01T09:15:00Z"),
    });
  });

  it.each([
    ["bank_transfer", "Virtual Account"],
    ["e_wallet", "E-Wallet"],
    ["card", "card"],
    [undefined, null],
  ])("maps payment_method %s to channel %s", async (paymentMethod, channel) => {
    const webhook = signSvixWebhook(WEBHOOK_SECRET, "msg_channel", completedBody({ payment_method: paymentMethod }));

    const event = await adapter.parseWebhook(webhook);

    expect(event?.channel).toBe(channel);
  });

  function withEventType(eventType: string) {
    const body = JSON.parse(completedBody()) as { event_type: string };
    body.event_type = eventType;
    return JSON.stringify(body);
  }

  it("maps 'payment.failed' and 'payment.expired' to their kinds", async () => {
    const failed = await adapter.parseWebhook(signSvixWebhook(WEBHOOK_SECRET, "msg_failed", withEventType("payment.failed")));
    expect(failed?.kind).toBe("failed");

    const expired = await adapter.parseWebhook(signSvixWebhook(WEBHOOK_SECRET, "msg_expired", withEventType("payment.expired")));
    expect(expired?.kind).toBe("expired");
  });

  it("answers SumoPod's 'payment.test' connectivity ping with null (2xx, ignored, nothing recorded)", async () => {
    const webhook = signSvixWebhook(WEBHOOK_SECRET, "msg_test", JSON.stringify({ event_type: "payment.test", data: null }));

    expect(await adapter.parseWebhook(webhook)).toBeNull();
  });

  it("rejects a webhook whose signature does not check out", async () => {
    const genuine = signSvixWebhook(WEBHOOK_SECRET, "msg_bad", completedBody());
    const tampered: WebhookRequest = { ...genuine, headers: { ...genuine.headers, "svix-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" } };

    await expect(adapter.parseWebhook(tampered)).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it("rejects a webhook whose body was tampered with after signing", async () => {
    const genuine = signSvixWebhook(WEBHOOK_SECRET, "msg_tamper", completedBody());
    const tampered: WebhookRequest = { ...genuine, rawBody: genuine.rawBody.replace("150000", "1") };

    await expect(adapter.parseWebhook(tampered)).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it("rejects a signature signed with another project's secret", async () => {
    const otherSecret = "whsec_" + Buffer.from("a different sumopod project secret").toString("base64");
    const webhook = signSvixWebhook(otherSecret, "msg_other", completedBody());

    await expect(adapter.parseWebhook(webhook)).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it("rejects a 'payment.completed' payload with no paid_at", async () => {
    const webhook = signSvixWebhook(WEBHOOK_SECRET, "msg_no_paid_at", completedBody({ paid_at: null }));

    await expect(adapter.parseWebhook(webhook)).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it("accepts a webhook carrying two v1 signatures from a secret rotation, verified with either the old or the new secret", async () => {
    const oldSecret = WEBHOOK_SECRET;
    const newSecret = "whsec_" + Buffer.from("sumopod-rotated-secret-32-bytes!").toString("base64");
    const body = completedBody();
    const messageId = "msg_rotate";
    const timestamp = new Date();
    const oldSignature = new Webhook(oldSecret).sign(messageId, timestamp, body);
    const newSignature = new Webhook(newSecret).sign(messageId, timestamp, body);
    const webhook: WebhookRequest = {
      rawBody: body,
      headers: {
        "svix-id": messageId,
        "svix-timestamp": String(Math.floor(timestamp.getTime() / 1000)),
        "svix-signature": `${oldSignature} ${newSignature}`,
      },
    };

    const providerWith = (webhookSecret: string) =>
      new SumopodPaymentProvider({ apiKey: API_KEY, webhookSecret, baseUrl: "https://unused.example" });
    const withOldSecret = await providerWith(oldSecret).parseWebhook(webhook);
    const withNewSecret = await providerWith(newSecret).parseWebhook(webhook);

    expect(withOldSecret?.eventId).toBe(messageId);
    expect(withNewSecret?.eventId).toBe(messageId);
  });
});
