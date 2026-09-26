import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Webhook } from "svix";
import { FAKE_PAYMENT_WEBHOOK_SECRET } from "../src/adapters/memory/fake-payment-secret";
import { seedE2eAdminPlatform } from "./support/admin-platform";

/*
 * The payment webhook critical path (spec, Testing Decisions, end-to-end 2)
 * on a local stack, which runs the fake PaymentProvider: an example Tagihan
 * (seeded by the seed-tagihan CLI inside the web container), Bayar on its page,
 * then the provider's signed "paid" webhook posted to the running app marks it
 * Lunas and its Bukti Pembayaran page appears.
 *
 * Override the seed with E2E_SEED_TAGIHAN, like E2E_SEED_ADMIN, e.g.
 * "docker compose -p <stack> exec -T web node dist/seed-tagihan.mjs".
 */
const SEED_TAGIHAN = (process.env.E2E_SEED_TAGIHAN ?? "docker compose -p makam-v1-dev exec -T web node dist/seed-tagihan.mjs").split(" ");

/** The fake PaymentProvider's Svix secret, unless the stack sets its own FAKE_PAYMENT_WEBHOOK_SECRET. */
const WEBHOOK_SECRET = process.env.E2E_PAYMENT_WEBHOOK_SECRET ?? FAKE_PAYMENT_WEBHOOK_SECRET;

function seedTagihan(): { nomorTagihan: string; path: string } {
  const [command, ...args] = SEED_TAGIHAN;
  const output = execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const seeded = /Tagihan contoh (TGH\/\d{4}\/\d{6}) terbit: (\/dokumen\/[A-Za-z0-9_-]{43})/.exec(output);
  if (!seeded) throw new Error(`seed-tagihan did not issue a Tagihan: ${output}`);
  return { nomorTagihan: seeded[1], path: seeded[2] };
}

test("a signed 'paid' webhook posted to the running app marks the Tagihan Lunas and its Bukti Pembayaran page appears", async ({
  page,
  request,
}) => {
  seedE2eAdminPlatform();
  const tagihan = seedTagihan();
  // The fake provider's payment page is not a real site: stand in for it.
  await page.route("https://pay.fake.local/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Pembayaran</title><p>Halaman pembayaran (contoh)</p>" }),
  );

  await page.goto(tagihan.path);
  await expect(page.getByText("Belum Dibayar", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bayar Rp 150.000" }).click();
  await page.waitForURL(/^https:\/\/pay\.fake\.local\/fakepay_/);
  const providerPaymentId = new URL(page.url()).pathname.slice(1);

  const body = JSON.stringify({
    type: "payment.paid",
    data: {
      payment_id: providerPaymentId,
      reference: tagihan.nomorTagihan,
      amount: 150_000,
      channel: "QRIS",
      occurred_at: new Date().toISOString(),
    },
  });
  const messageId = `msg_${randomUUID()}`;
  const signedAt = new Date();
  const webhook = await request.post("/api/webhooks/pembayaran", {
    headers: {
      "content-type": "application/json",
      "svix-id": messageId,
      "svix-timestamp": String(Math.floor(signedAt.getTime() / 1000)),
      "svix-signature": new Webhook(WEBHOOK_SECRET).sign(messageId, signedAt, body),
    },
    data: body,
  });
  expect(webhook.status()).toBe(200);

  await page.goto(tagihan.path);
  await expect(page.getByText("Lunas", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Bayar/ })).toHaveCount(0);
  await page.getByRole("link", { name: "Lihat Bukti Pembayaran" }).click();

  await expect(page.getByRole("heading", { name: "Bukti Pembayaran" })).toBeVisible();
  await expect(page.getByText(tagihan.nomorTagihan, { exact: true })).toBeVisible();
  await expect(page.getByText("Pembayaran online (QRIS)")).toBeVisible();
});
