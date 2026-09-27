import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { authenticatorCode } from "../../tests/support/totp";
import { lastEmailCode } from "./email-outbox";

/**
 * A fresh X-Real-IP for the next request, as the host's nginx would set it:
 * the stack has no nginx, and the per-IP limit allows one emailed code per
 * 60 s from one IP.
 */
export async function fromNewIp(page: Page) {
  const ip = `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 254) + 1).join(".")}`;
  await page.setExtraHTTPHeaders({ "x-real-ip": ip });
}

/**
 * Logs an email in on Masuk with the Kode Masuk from the fake email outbox;
 * where it lands is up to the caller. The stack runs on the system Clock, so
 * one email gets a new Kode Masuk only 60 s after the last: log each email in
 * once per spec (use a fresh email, or keep the page that is signed in).
 */
export async function masuk(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/masuk");
  await fromNewIp(page);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
  await expect(page.getByTestId("kode-masuk-email")).toHaveText(email.toLowerCase());
  await page.getByLabel("Kode Masuk").fill(await lastEmailCode(request, email.toLowerCase(), "Kode Masuk"));
  await page.getByRole("button", { name: "Masuk" }).click();
}

/**
 * The same, for an email whose last Kode Masuk was asked for moments ago: one
 * per email per 60 s, so a seed CLI that just signed that Akun in leaves the
 * window closed. It asks again, waiting the window out, rather than failing on a
 * screen that is behaving exactly as it should.
 */
export async function masukSetelahJeda(
  page: Page,
  request: APIRequestContext,
  email: string,
  options: { percobaan?: number; tungguMs?: number } = {},
) {
  const percobaan = options.percobaan ?? 12;
  for (let ke = 0; ke < percobaan; ke += 1) {
    await page.goto("/masuk");
    await fromNewIp(page);
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /Kirim Kode Masuk|Kirim ulang kode/ }).click();
    if (await page.getByTestId("kode-masuk-email").waitFor({ timeout: 5_000 }).then(() => true, () => false)) break;
    await page.waitForTimeout(options.tungguMs ?? 15_000);
  }
  await expect(page.getByTestId("kode-masuk-email")).toHaveText(email.toLowerCase());
  await page.getByLabel("Kode Masuk").fill(await lastEmailCode(request, email.toLowerCase(), "Kode Masuk"));
  await page.getByRole("button", { name: "Masuk" }).click();
  // Wait for the login's own redirect to land, so a caller's next navigation is not raced by it.
  await expect(page).toHaveURL(/\/(akun|staf)/, { timeout: 15_000 });
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
