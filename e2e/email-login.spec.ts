import { expect, test } from "@playwright/test";
import { lastEmailCode } from "./support/email-outbox";
import { coldEmail } from "./support/emails";
import { fromNewIp, masuk } from "./support/masuk";
import { coldNumber } from "./support/numbers";

/*
 * Akun Saya smoke: the phone number as a contact, and Verifikasi email moving
 * the Akun to a new Email Terverifikasi, which the next Kode Masuk then uses.
 * The rules themselves are covered by the identity module's tests.
 */

test("Akun Saya: save a phone number, Verifikasi email to a new address, Keluar, and Masuk with the new one", async ({
  page,
  request,
}) => {
  const oldEmail = coldEmail("lama");
  const newEmail = coldEmail("baru");
  const phone = coldNumber();

  await masuk(page, request, oldEmail);
  await expect(page).toHaveURL(/\/akun$/);

  await page.getByLabel("Nomor telepon").fill(phone.typed);
  await page.getByRole("button", { name: "Simpan nomor telepon" }).click();
  await expect(page.getByText(`Nomor telepon disimpan: ${phone.canonical}.`)).toBeVisible();

  await fromNewIp(page);
  await page.getByLabel("Email baru").fill(newEmail);
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  await page.getByLabel("Kode dari email").fill(await lastEmailCode(request, newEmail, "verifikasi"));
  await page.getByRole("button", { name: "Simpan email baru" }).click();
  await expect(page.getByTestId("akun-email")).toHaveText(newEmail);

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/masuk$/);

  await masuk(page, request, newEmail);
  await expect(page).toHaveURL(/\/akun$/);
  await expect(page.getByTestId("akun-login-email")).toHaveText(newEmail);
  await expect(page.getByTestId("akun-phone-number")).toHaveValue(phone.canonical);
});
