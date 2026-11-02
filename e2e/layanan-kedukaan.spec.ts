import { expect, test } from "@playwright/test";

/**
 * Layanan Kedukaan and Konsultasi Rencana Pemakaman (ADR 0010): the pages a family reads before asking,
 * on a fresh stack with no data. Icons, never photographs of graves; the form asks for a Kode Masuk at Kirim.
 */
test("Layanan Kedukaan lists the six services as icon cards and opens each one's request form", async ({ page }) => {
  await page.goto("/layanan-kedukaan");

  await expect(page.getByRole("heading", { level: 1, name: "Layanan Kedukaan" })).toBeVisible();
  for (const judul of ["Rumah Duka", "Mobil Jenazah", "Jasa Cargo Jenazah", "Jasa Repatriasi Jenazah", "Peti Jenazah", "Bunga Duka Cita"]) {
    await expect(page.getByRole("main").getByRole("link", { name: new RegExp(`^${judul}`) })).toBeVisible();
  }
  await expect(page.getByRole("main").locator("img")).toHaveCount(0);

  await page.getByRole("main").getByRole("link", { name: /^Mobil Jenazah/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mobil Jenazah" })).toBeVisible();
  await expect(page.getByLabel("Lokasi penjemputan")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim permintaan" })).toBeVisible();
});

test("Konsultasi Rencana Pemakaman asks when to call", async ({ page }) => {
  await page.goto("/konsultasi-rencana-pemakaman");

  await expect(page.getByRole("heading", { level: 1, name: "Konsultasi Rencana Pemakaman" })).toBeVisible();
  await expect(page.getByLabel("Waktu Anda bisa dihubungi")).toBeVisible();
  await expect(page.getByRole("main").locator("img")).toHaveCount(0);
});
