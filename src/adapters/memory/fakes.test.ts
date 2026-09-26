import { describe, expect, it } from "vitest";
import { InvalidWebhookError } from "@/ports/payment-provider";
import { FakeClock } from "./fake-clock";
import {
  FakeEmailSender,
  FakeFileStore,
  FakePaymentProvider,
  FakePdfRenderer,
  FakeWebPush,
} from "./index";
import { wib } from "@/lib/time/jakarta";

const clock = () => new FakeClock(wib("2026-10-01 09:00"));

describe("fake PaymentProvider", () => {
  it("records each payment created for a Tagihan and returns a payment link", async () => {
    const payments = new FakePaymentProvider({ clock: clock() });

    const payment = await payments.createPayment({
      reference: "TAG-2026-000001",
      amountRupiah: 7_500_000,
      description: "Tagihan Pemesanan Saat Duka",
      payer: { name: "Budi", phone: "081234567890" },
    });

    expect(payment.paymentUrl).toMatch(/^https:\/\//);
    expect(payment.expiresAt).toEqual(wib("2026-10-02 09:00"));
    expect(payments.created).toEqual([
      expect.objectContaining({ reference: "TAG-2026-000001", amountRupiah: 7_500_000 }),
    ]);
  });

  it("emits a Svix-signed 'paid' webhook that the provider verifies and parses", async () => {
    const payments = new FakePaymentProvider({ clock: clock() });
    const payment = await payments.createPayment({
      reference: "TAG-2026-000001",
      amountRupiah: 7_500_000,
      description: "Tagihan",
    });

    const webhook = payments.webhookFor(payment.providerPaymentId, "paid");
    expect(webhook.headers).toMatchObject({
      "svix-id": expect.any(String),
      "svix-timestamp": expect.any(String),
      "svix-signature": expect.stringMatching(/^v1,/),
    });

    const event = await payments.parseWebhook(webhook);
    expect(event).toEqual({
      eventId: webhook.headers["svix-id"],
      kind: "paid",
      providerPaymentId: payment.providerPaymentId,
      reference: "TAG-2026-000001",
      amountRupiah: 7_500_000,
      channel: "QRIS",
      paidAt: wib("2026-10-01 09:00"),
    });
  });

  it("rejects a webhook whose body was tampered with", async () => {
    const payments = new FakePaymentProvider({ clock: clock() });
    const payment = await payments.createPayment({
      reference: "TAG-1",
      amountRupiah: 100_000,
      description: "Tagihan",
    });
    const webhook = payments.webhookFor(payment.providerPaymentId, "paid");

    const tampered = { ...webhook, rawBody: webhook.rawBody.replace("100000", "1") };

    await expect(payments.parseWebhook(tampered)).rejects.toBeInstanceOf(InvalidWebhookError);
  });

  it("rejects a webhook signed with another secret", async () => {
    const ours = new FakePaymentProvider({ clock: clock() });
    const theirs = new FakePaymentProvider({
      clock: clock(),
      webhookSecret: "whsec_" + Buffer.from("another-secret-another-secret!!").toString("base64"),
    });
    const payment = await theirs.createPayment({ reference: "TAG-1", amountRupiah: 1, description: "x" });

    await expect(
      ours.parseWebhook(theirs.webhookFor(payment.providerPaymentId, "paid")),
    ).rejects.toBeInstanceOf(InvalidWebhookError);
  });
});

describe("fake message senders", () => {
  it("the email and web push fakes record what they were given", async () => {
    const email = new FakeEmailSender();
    const push = new FakeWebPush();

    await email.send({
      to: "keluarga@example.com",
      subject: "Bukti Pembayaran",
      text: "Terlampir.",
      attachments: [{ filename: "bukti.pdf", contentType: "application/pdf", content: new Uint8Array([1]) }],
    });
    await push.send({
      subscription: { endpoint: "https://push.example/1", keys: { p256dh: "k", auth: "a" } },
      notification: { title: "Pemesanan baru", body: "Saat Duka menunggu konfirmasi" },
    });

    expect(email.sent).toEqual([expect.objectContaining({ subject: "Bukti Pembayaran" })]);
    expect(push.sent).toEqual([
      expect.objectContaining({ notification: expect.objectContaining({ title: "Pemesanan baru" }) }),
    ]);
  });
});

// The put / signedUrl / delete contract (expiry, replace, path-traversal and
// size guards) is shared with the host-disk adapter in file-store.contract.ts
// (run against this fake from fake-files.test.ts).
describe("fake FileStore", () => {
  it("stores what it was given and lets a test read it back from `.stored`", async () => {
    const files = new FakeFileStore({ clock: clock() });

    await files.put({ key: "ktp/1.jpg", body: new Uint8Array([1, 2, 3]), contentType: "image/jpeg" });

    expect(files.stored.get("ktp/1.jpg")).toEqual({
      key: "ktp/1.jpg",
      body: new Uint8Array([1, 2, 3]),
      contentType: "image/jpeg",
    });
  });

  it("opening a URL that names no file of its own (foreign origin, unknown key) gives null, never a match", () => {
    const files = new FakeFileStore({ clock: clock() });
    expect(files.open("https://files.fake.local/ktp/2.jpg?expires=9999999999")).toBeNull();
    expect(files.open("https://example.com/ktp/1.jpg?expires=9999999999")).toBeNull();
  });
});

describe("fake PdfRenderer", () => {
  it("records each document page rendered and returns PDF bytes", async () => {
    const pdf = new FakePdfRenderer();

    const bytes = await pdf.render({ url: "https://makam.co.id/dokumen/bukti/1" });

    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
    expect(pdf.rendered).toEqual([{ url: "https://makam.co.id/dokumen/bukti/1" }]);
  });
});
