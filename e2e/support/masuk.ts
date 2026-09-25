import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { authenticatorCode } from "../../tests/support/totp";
import type { E2eNumber } from "./numbers";
import { lastOtp } from "./whatsapp-outbox";

/** Logs a number in on Masuk by WhatsApp OTP; where it lands is up to the caller. */
export async function masuk(page: Page, request: APIRequestContext, number: E2eNumber) {
  await page.goto("/masuk");
  // The stack runs on the system Clock: a number that just had an OTP waits up to 60 s for the next one.
  await expect(async () => {
    await page.getByLabel("Nomor WhatsApp").fill(number.typed);
    await page.getByRole("button", { name: "Kirim kode lewat WhatsApp" }).click();
    await expect(page.getByTestId("otp-phone-number")).toHaveText(number.canonical, { timeout: 3_000 });
  }).toPass({ timeout: 75_000, intervals: [5_000] });
  await page.getByLabel("Kode verifikasi").fill(await lastOtp(request, number.canonical));
  await page.getByRole("button", { name: "Masuk" }).click();
}

/** On the TOTP step, starts enrolment and returns the authenticator secret the screen shows. */
export async function startTotpEnrolment(page: Page): Promise<string> {
  await expect(page).toHaveURL(/\/staf\/totp$/);
  await page.getByRole("button", { name: "Daftarkan aplikasi authenticator" }).click();
  return (await page.getByTestId("totp-secret").textContent())!.replace(/\s/g, "");
}

/** Types the authenticator's current code for `secret` and submits it. */
export async function submitTotp(page: Page, secret: string) {
  await page.getByLabel("Kode authenticator").fill(authenticatorCode(secret, new Date()));
  await page.getByRole("button", { name: "Verifikasi" }).click();
}
