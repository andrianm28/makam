import { expect, test, type Page } from "@playwright/test";
import { lastEmailCode } from "./support/email-outbox";
import { masuk } from "./support/masuk";
import { coldNumber } from "./support/numbers";

/*
 * Ticket 67 smoke: Verifikasi Email in Akun Saya with the fake email outbox,
 * then Keluar, then Masuk dengan email. The rules themselves are covered by
 * the identity module's tests (email-login.test.ts).
 *
 * The stack has no nginx, so each step sends its own X-Real-IP (as nginx
 * would set it) to stay clear of the per-IP 60 s limit on emailed codes.
 */

async function fromNewIp(page: Page) {
  const ip = `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 254) + 1).join(".")}`;
  await page.setExtraHTTPHeaders({ "x-real-ip": ip });
}

test("Verifikasi Email in Akun Saya, Keluar, then Masuk dengan email lands back on Akun Saya", async ({ page, request }) => {
  const number = coldNumber();
  const email = `pemesan-${number.canonical.slice(3)}@contoh.id`;

  await masuk(page, request, number);
  await expect(page).toHaveURL(/\/akun$/);

  await fromNewIp(page);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim kode verifikasi" }).click();
  await page.getByLabel("Kode dari email").fill(await lastEmailCode(request, email, "verifikasi"));
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  await expect(page.getByTestId("akun-email-status")).toHaveText("Terverifikasi");

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/masuk$/);

  await fromNewIp(page);
  await page.getByRole("link", { name: "Masuk dengan email" }).click();
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByRole("button", { name: "Kirim kode lewat email" }).click();
  await expect(page.getByText("Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim.")).toBeVisible();
  await page.getByLabel("Kode dari email").fill(await lastEmailCode(request, email, "Kode Masuk"));
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page).toHaveURL(/\/akun$/);
  await expect(page.getByTestId("akun-phone-number")).toHaveText(number.canonical);
});
