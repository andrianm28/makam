import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FakePaymentProvider } from "@/adapters/memory";
import type { Rupiah } from "@/lib/rupiah";
import { wib } from "@/lib/time/jakarta";
import type { WebhookRequest } from "@/ports/payment-provider";
import { PENGATURAN_OPERATOR } from "../../../../../tests/support/billing";
import { resetDatabase, testDatabase } from "../../../../../tests/support/database";
import { browser } from "../../../../../tests/support/next-request";
import { testServerRuntime } from "../../../../../tests/support/server-runtime";
import { signInAsAdminPlatform } from "../../../../../tests/support/server-sign-in";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => import("../../../../../tests/support/next-request"));

const { close } = testDatabase();
afterAll(close);
const server = testServerRuntime();
beforeEach(async () => {
  await resetDatabase();
  browser.reset();
});

const payments = () => server.runtime().adapters.payments as FakePaymentProvider;

/** A Tagihan someone clicked Bayar on, and the provider payment Bayar created. */
async function tagihanBeingPaid() {
  const admin = await signInAsAdminPlatform(server);
  const { operatorSettings, billing } = server.runtime();
  await operatorSettings.change(admin, { ...PENGATURAN_OPERATOR, reason: null });
  const issued = await billing.issueTagihan({
    moment: { kind: "terencana", holdExpiresAt: wib("2026-10-02 09:00") },
    addressee: { name: "Siti Rahmawati", phoneNumber: "081234567890", accountId: null },
    nomorPemesanan: "MKM-2026-000001",
    placeName: "Makam Wakaf Al-Ikhlas",
    lines: [{ kind: "biaya_layanan_platform", label: "Biaya Layanan Platform", amount: 150_000 as Rupiah, provider: { kind: "operator" } }],
  });
  if (!issued.ok) throw new Error(issued.reason);
  const bayar = await billing.bayar(issued.tagihan.link);
  if (!bayar.ok) throw new Error(bayar.reason);
  const payment = payments().created.find((created) => created.paymentUrl === bayar.paymentUrl);
  if (!payment) throw new Error("no provider payment");
  return { tagihan: issued.tagihan, payment };
}

const post = (webhook: WebhookRequest) =>
  POST(
    new Request("http://localhost/api/webhooks/pembayaran", {
      method: "POST",
      headers: { "content-type": "application/json", ...webhook.headers },
      body: webhook.rawBody,
    }),
  );

describe("POST /api/webhooks/pembayaran", () => {
  it("a signed 'paid' webhook is accepted and the Tagihan is Lunas with its Bukti Pembayaran", async () => {
    const { tagihan, payment } = await tagihanBeingPaid();

    const response = await post(payments().webhookFor(payment.providerPaymentId, "paid"));

    expect(response.status).toBe(200);
    expect(await server.runtime().billing.tagihan(tagihan.id)).toMatchObject({ status: "lunas" });
  });

  it("a replayed webhook is acknowledged again and changes nothing", async () => {
    const { payment } = await tagihanBeingPaid();
    const webhook = payments().webhookFor(payment.providerPaymentId, "paid");

    expect((await post(webhook)).status).toBe(200);
    expect((await post(webhook)).status).toBe(200);
    expect(await server.runtime().billing.nextDocumentNumber("BYR")).toBe("BYR/2026/000002");
  });

  it("a webhook whose signature does not check out is refused and nothing is paid", async () => {
    const { tagihan, payment } = await tagihanBeingPaid();
    const genuine = payments().webhookFor(payment.providerPaymentId, "paid");

    const response = await post({ ...genuine, headers: { ...genuine.headers, "svix-signature": "v1,AAAA" } });

    expect(response.status).toBe(401);
    expect(await server.runtime().billing.tagihan(tagihan.id)).toMatchObject({ status: "belum_dibayar" });
  });

  it("a body far larger than any webhook is refused unread", async () => {
    const response = await post({ rawBody: "x".repeat(70_000), headers: {} });

    expect(response.status).toBe(413);
  });

  it("a streamed body over the limit is refused while it is read, whatever length it declares", async () => {
    const chunk = new TextEncoder().encode("x".repeat(16 * 1024));
    let sent = 0;
    const endless = () =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          sent += 1;
          controller.enqueue(chunk);
          if (sent > 1_000) controller.close();
        },
      });
    const streamed = (headers: Record<string, string>) =>
      POST(new Request("http://localhost/api/webhooks/pembayaran", { method: "POST", headers, body: endless(), duplex: "half" } as RequestInit));

    expect((await streamed({ "content-type": "application/json" })).status).toBe(413);
    sent = 0;
    expect((await streamed({ "content-type": "application/json", "content-length": "10" })).status).toBe(413);
    // Reading stopped at the limit, long before the stream's end.
    expect(sent).toBeLessThan(10);
  });
});
