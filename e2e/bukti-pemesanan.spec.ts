import { randomUUID } from "node:crypto";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { Webhook } from "svix";
import { FAKE_PAYMENT_WEBHOOK_SECRET } from "../src/adapters/memory/fake-payment-secret";
import { seedE2eAdminPlatform } from "./support/admin-platform";
import { lastEmailCode } from "./support/email-outbox";
import { coldEmail } from "./support/emails";
import { fromNewIp, masukSetelahJeda } from "./support/masuk";
import { coldNumber } from "./support/numbers";
import { seedSaatDukaLokasi } from "./support/saat-duka";

/*
 * The Saat Duka critical path end to end (spec, Testing Decisions, end-to-end 1;
 * ticket 25's AC 6): the family's "Pilih makam" list, the Kode Masuk by email at
 * Kirim, the Admin Lokasi's confirmation, the recorded burial, the payment (the
 * fake provider's signed webhook), and the Bukti Pemesanan that proves the right.
 *
 * Two browsers, because two people: the family orders and pays, the Lokasi's own
 * Admin Lokasi confirms and records the burial. The rules behind each step (the
 * pay-after clock from the recorded burial, the tenure arithmetic, the document
 * numbering) are the modules' own tests, not this file's — this one proves the
 * screens are wired to each other and that a family ends up holding its proof.
 */

const ADMIN_LOKASI = "lokasi.saat-duka@contoh.id";
const WEBHOOK_SECRET = process.env.E2E_PAYMENT_WEBHOOK_SECRET ?? FAKE_PAYMENT_WEBHOOK_SECRET;

// The seed CLI signs the fixture's Admin Lokasi in, which closes that email's
// Kode Masuk window for a minute; this path waits it out once.
test.setTimeout(240_000);

test.describe.configure({ mode: "serial" });

/** The Lokasi Mitra's own browser, where the order is confirmed and the burial recorded. */
let lokasiMitra: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  lokasiMitra = await (await browser.newContext()).newPage();
});

test("Saat Duka: a family orders, the Lokasi confirms and records the burial, the payment settles, and the Bukti Pemesanan is issued", async ({
  page,
  request,
}) => {
  // A stack of its own has neither the Admin Platform nor the Lokasi Mitra yet.
  seedE2eAdminPlatform();
  const lokasi = seedSaatDukaLokasi();
  const lokasiId = lokasi.split("/").pop() ?? "";
  const email = coldEmail();
  const telepon = coldNumber();

  // The family: the Pilih makam list, then Kirim with the Kode Masuk by email.
  await page.goto(lokasi ? `/pesan-makam/saat-duka?lokasiId=${lokasiId}` : "/pesan-makam/saat-duka");
  await page.getByRole("radio", { name: /Reguler 1 × 2 m/ }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await expect(page).toHaveURL(/\/pesan-makam\/saat-duka\/data\?/);
  await page.getByLabel("Nama lengkap").fill("Budi Santoso");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Nomor telepon").fill(telepon.typed);
  await page.getByLabel("Nama almarhum / almarhumah").fill("Siti Aminah");
  await page.getByLabel("Tanggal wafat").fill("2026-09-30");
  await fromNewIp(page);
  await page.getByRole("button", { name: "Kirim pesanan" }).first().click();
  await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
  await page.getByLabel("Kode Masuk").fill(await lastEmailCode(request, email.toLowerCase(), "Kode Masuk"));
  await page.getByRole("button", { name: "Kirim pesanan" }).click();
  await expect(page).toHaveURL(/\/pesanan\/MKM-\d{4}-\d{6}$/);
  const nomor = (await page.getByTestId("nomor-pemesanan").textContent())!.trim();
  await expect(page.locator("[data-slot=status-badge]")).toHaveText("Diajukan");

  // The Lokasi Mitra's own Admin Lokasi confirms the order: a plot, and the Tagihan.
  // The seed CLI signed this Akun in moments ago, so its Kode Masuk window is closed.
  await masukSetelahJeda(lokasiMitra, request, ADMIN_LOKASI);
  await lokasiMitra.goto(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
  await lokasiMitra.getByLabel("Pemakaman").fill(`${hariIni()}T10:00`);
  await lokasiMitra.getByRole("button", { name: "Konfirmasi pesanan" }).click();
  // The order's own status and its Tagihan's are two separate badges (AC 5).
  await expect(lokasiMitra.getByTestId("status-pesanan-tagihan")).toContainText("Dikonfirmasi");
  await expect(lokasiMitra.getByTestId("status-pesanan-tagihan")).toContainText("Belum Dibayar");
  await expect(lokasiMitra.getByText(/^TGH\/\d{4}\/\d{6}$/)).toBeVisible();

  // …and records the burial, which is what starts the Hak Pakai's term. A burial
  // cannot be recorded for a day that has not come, so it is today's.
  await lokasiMitra.getByLabel("Tanggal pemakaman").fill(hariIni());
  await lokasiMitra.getByRole("button", { name: "Catat pemakaman" }).click();
  await expect(lokasiMitra.getByTestId("status-pesanan-tagihan")).toContainText("Dimakamkan");
  await expect(lokasiMitra.getByTestId("status-pesanan-tagihan")).toContainText("Belum Dibayar");
  await expect(lokasiMitra.getByText("Pemakaman dicatat", { exact: true })).toBeVisible();
  await expect(lokasiMitra.getByRole("button", { name: "Catat pemakaman" })).toHaveCount(0);

  // The family pays the Tagihan from its own order page. (The confirmation email
  // carries the same link, but a queued family message is sent by the worker, whose
  // in-memory outbox the web container's dev endpoint does not see.)
  await page.goto(`/pesanan/${nomor}`);
  const tagihanPath = (await page.getByRole("link", { name: /^TGH\/\d{4}\/\d{6}$/ }).getAttribute("href"))!;
  const nomorTagihan = (await page.getByText(/^TGH\/\d{4}\/\d{6}$/).first().textContent())!.trim();
  await page.goto(tagihanPath);
  await page.route("https://pay.fake.local/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<title>Pembayaran</title><p>Halaman pembayaran (contoh)</p>" }),
  );
  const bayar = page.getByRole("button", { name: /^Bayar/ });
  const jumlah = Number((/\d[\d.]*/.exec((await bayar.textContent()) ?? "")?.[0] ?? "").replaceAll(".", ""));
  await bayar.click();
  await page.waitForURL(/^https:\/\/pay\.fake\.local\/fakepay_/);
  const providerPaymentId = new URL(page.url()).pathname.slice(1);

  // The provider's signed "paid" webhook, posted to the running app.
  const body = JSON.stringify({
    type: "payment.paid",
    data: {
      payment_id: providerPaymentId,
      reference: nomorTagihan,
      amount: jumlah,
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

  // The order is Selesai: paid, with the Bukti Pemesanan that proves the right.
  await page.goto(`/pesanan/${nomor}`);
  await expect(page.locator("[data-slot=status-badge]")).toHaveText("Selesai");
  await expect(page.getByTestId("status-tagihan")).toHaveText("Lunas");
  const bukti = page.getByTestId("bukti-pemesanan");
  await expect(bukti).toContainText(/BPM\/\d{4}\/\d{6}/);

  // The document itself, on its own unguessable link, in the Lokasi Mitra's name.
  await page.getByRole("link", { name: "Buka Bukti Pemesanan" }).click();
  await expect(page.getByRole("heading", { name: "Bukti Pemesanan" })).toBeVisible();
  await expect(page.getByText(/BPM\/\d{4}\/\d{6}/)).toBeVisible();
  await expect(page.getByText("Pemegang Hak")).toBeVisible();
  await expect(page.getByText("Budi Santoso").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /Petunjuk arah/ })).toBeVisible();
});

/** Today's calendar date in WIB, as a `date` or `datetime-local` input holds it. */
function hariIni(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
}
