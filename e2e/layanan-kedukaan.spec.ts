import { expect, test } from "@playwright/test";

/**
 * Layanan Kedukaan and Konsultasi Rencana Pemakaman (ADR 0010): the pages a family reads before asking,
 * on a fresh stack with no data. Icons, never photographs of graves; the form asks for a Kode Masuk at Kirim.
 */
test("Layanan Kedukaan lists Rumah Duka as a request card, three as Segera hadir, and hides Mobil and Peti Jenazah", async ({ page }) => {
  await page.goto("/layanan-kedukaan");

  const main = page.getByRole("main");
  await expect(page.getByRole("heading", { level: 1, name: "Layanan Kedukaan" })).toBeVisible();
  await expect(main.getByRole("link", { name: /^Rumah Duka/ })).toBeVisible();
  for (const judul of ["Jasa Cargo Jenazah", "Jasa Repatriasi Jenazah", "Bunga Duka Cita"]) {
    await expect(main.getByText(judul, { exact: true })).toBeVisible();
    await expect(main.getByRole("link", { name: new RegExp(`^${judul}`) })).toHaveCount(0);
  }
  await expect(main.getByText("Segera hadir", { exact: true })).toHaveCount(3);
  for (const judul of ["Mobil Jenazah", "Peti Jenazah"]) await expect(main.getByText(judul)).toHaveCount(0);
  await expect(main.locator("img")).toHaveCount(0);

  await main.getByRole("link", { name: /^Rumah Duka/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Rumah Duka" })).toBeVisible();
  await expect(page.getByLabel("Tanggal dibutuhkan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim permintaan" })).toBeVisible();
});

test("Konsultasi Rencana Pemakaman asks when to call", async ({ page }) => {
  await page.goto("/konsultasi-rencana-pemakaman");

  await expect(page.getByRole("heading", { level: 1, name: "Konsultasi Rencana Pemakaman" })).toBeVisible();
  await expect(page.getByLabel("Waktu Anda bisa dihubungi")).toBeVisible();
  await expect(page.getByRole("main").locator("img")).toHaveCount(0);
});
