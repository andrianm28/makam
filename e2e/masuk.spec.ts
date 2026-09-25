import { expect, test } from "@playwright/test";
import { coldNumber } from "./support/numbers";
import { lastOtp } from "./support/whatsapp-outbox";

test("Masuk with a cold WhatsApp number and the OTP lands on Akun Saya", async ({ page, request }) => {
  const number = coldNumber();
  await page.clock.install();
  await page.goto("/masuk");

  await page.getByLabel("Nomor WhatsApp").fill(number.typed);
  await page.getByRole("button", { name: "Kirim kode lewat WhatsApp" }).click();

  await expect(page.getByTestId("otp-phone-number")).toHaveText(number.canonical);
  await expect(page.getByTestId("otp-phone-only-notice")).toContainText(
    "tidak di WhatsApp Web atau WhatsApp Desktop",
  );
  await expect(page.getByTestId("otp-fallback-slot")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Kirim ulang kode \(\d+ detik\)/ })).toBeDisabled();

  await page.clock.fastForward("01:00");
  await expect(page.getByTestId("otp-fallback-slot")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim ulang kode" })).toBeEnabled();

  await page.getByLabel("Kode verifikasi").fill(await lastOtp(request, number.canonical));
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page).toHaveURL(/\/akun$/);
  await expect(page.getByRole("heading", { name: "Akun Saya" })).toBeVisible();
  await expect(page.getByTestId("akun-phone-number")).toHaveText(number.canonical);
  await expect(page.getByText("Belum ada pesanan.")).toBeVisible();

  // Signed in: Masuk sends the Pemesan straight back to Akun Saya.
  await page.goto("/masuk");
  await expect(page).toHaveURL(/\/akun$/);

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/masuk$/);
  await page.goto("/akun");
  await expect(page).toHaveURL(/\/masuk$/);
});

test("a wrong OTP is refused on the Masuk screen", async ({ page }) => {
  const number = coldNumber();
  await page.goto("/masuk");
  await page.getByLabel("Nomor WhatsApp").fill(number.typed);
  await page.getByRole("button", { name: "Kirim kode lewat WhatsApp" }).click();
  await expect(page.getByTestId("otp-phone-number")).toHaveText(number.canonical);

  await page.getByLabel("Kode verifikasi").fill("000000");
  await page.getByRole("button", { name: "Masuk" }).click();

  // "000000" is the real code one time in a million; then this lands on Akun Saya instead.
  await expect(page.getByText("Kode salah. Periksa lagi kode di WhatsApp Anda.")).toBeVisible();
  await expect(page).toHaveURL(/\/masuk$/);
});
