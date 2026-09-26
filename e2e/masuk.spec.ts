import { expect, test } from "@playwright/test";
import { lastEmailCode } from "./support/email-outbox";
import { coldEmail } from "./support/emails";
import { fromNewIp } from "./support/masuk";

test("Masuk with a cold email: the Kode Masuk creates the Akun and lands on Akun Saya", async ({ page, request }) => {
  const email = coldEmail();
  await page.clock.install();
  await page.goto("/masuk");
  await expect(page.getByTestId("kode-masuk-cs")).toContainText("Tidak punya email? Minta bantuan CS");

  await fromNewIp(page);
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();

  await expect(page.getByTestId("kode-masuk-email")).toHaveText(email);
  await expect(page.getByRole("button", { name: /Kirim ulang kode \(\d+ detik\)/ })).toBeDisabled();
  await page.clock.fastForward("01:00");
  await expect(page.getByRole("button", { name: "Kirim ulang kode" })).toBeEnabled();

  await page.getByLabel("Kode Masuk").fill(await lastEmailCode(request, email, "Kode Masuk"));
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page).toHaveURL(/\/akun$/);
  await expect(page.getByRole("heading", { name: "Akun Saya" })).toBeVisible();
  await expect(page.getByTestId("akun-login-email")).toHaveText(email);
  await expect(page.getByText("Belum ada pesanan.")).toBeVisible();

  // Signed in: Masuk sends the Pemesan straight back to Akun Saya.
  await page.goto("/masuk");
  await expect(page).toHaveURL(/\/akun$/);

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/masuk$/);
  await page.goto("/akun");
  await expect(page).toHaveURL(/\/masuk$/);
});

test("a wrong Kode Masuk is refused on the Masuk screen", async ({ page, request }) => {
  const email = coldEmail();
  await page.goto("/masuk");
  await fromNewIp(page);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
  await expect(page.getByTestId("kode-masuk-email")).toHaveText(email);

  const code = await lastEmailCode(request, email, "Kode Masuk");
  await page.getByLabel("Kode Masuk").fill(code === "000000" ? "111111" : "000000");
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page.getByText("Kode salah. Periksa lagi kode di email Anda.")).toBeVisible();
  await expect(page).toHaveURL(/\/masuk$/);
});
