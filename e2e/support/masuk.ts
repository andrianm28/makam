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
