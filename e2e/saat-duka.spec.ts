import { expect, test } from "@playwright/test";
import { coldEmail } from "./support/emails";
import { lastEmailCode } from "./support/email-outbox";
import { fromNewIp } from "./support/masuk";
import { coldNumber } from "./support/numbers";
import { seedSaatDukaLokasi } from "./support/saat-duka";

/*
 * The Saat Duka wizard, both screens, on a stack the dev-only seed has given one
 * Terverifikasi Lokasi Mitra with cleared Tersedia Petak. The rules behind it
 * (the all-in total, the Tersedia count, the confirmation deadline, the
 * Pemegang Hak, no Tagihan) are the Pemesanan module's own tests; this walks
 * the screen a family meets, with the Kode Masuk from the fake email outbox.
 */

test("Saat Duka: pick a makam, send the order with a Kode Masuk, and read the Nomor Pemesanan", async ({ page, request }) => {
  const lokasi = seedSaatDukaLokasi();
  const email = coldEmail();
  const telepon = coldNumber();

  // Screen 1: the card's all-in total, its Tersedia count, and the sticky bar.
  await page.goto(lokasi ? `/pesan-makam/saat-duka?lokasiId=${lokasi.split("/").pop()}` : "/pesan-makam/saat-duka");
  await expect(page.getByRole("heading", { name: "Pilih makam" })).toBeVisible();
  await expect(page.getByText("Makam Wakaf Al-Ikhlas")).toBeVisible();
  await expect(page.getByText("Reguler 1 × 2 m")).toBeVisible();
  await expect(page.getByText("4 tersedia")).toBeVisible();
  // Harga Hak Pakai 7.500.000 + Biaya Pemakaman 2.000.000 + Biaya Layanan Platform 150.000.
  await expect(page.getByText("Rp 9.650.000").first()).toBeVisible();
  await expect(page.getByTestId("total-semua-biaya")).toHaveText("Rp 9.650.000");
  await expect(page.getByText("Dikonfirmasi paling lambat")).toBeVisible();

  // The sticky bar expands to the itemised lines.
  await page.getByRole("button", { name: /Lihat rincian|Total semua biaya/ }).click();
  await expect(page.getByText("Harga Hak Pakai – Reguler 1 × 2 m")).toBeVisible();
  await expect(page.getByText("Biaya Pemakaman").first()).toBeVisible();
  await expect(page.getByText("Biaya Layanan Platform")).toBeVisible();

  await page.getByRole("radio", { name: /Reguler 1 × 2 m/ }).click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await expect(page).toHaveURL(/\/pesan-makam\/saat-duka\/data\?/);

  // Screen 2: the family's data, then Kirim, which asks for the Kode Masuk.
  await expect(page.getByRole("heading", { name: "Data & kirim" })).toBeVisible();
  await expect(page.getByText("Belum ada yang dibayar sekarang.")).toBeVisible();
  await page.getByLabel("Nama lengkap").fill("Budi Santoso");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Nomor telepon").fill(telepon.typed);
  await page.getByLabel("Nama almarhum / almarhumah").fill("Siti Aminah");
  await page.getByLabel("Tanggal wafat").fill("2026-09-30");
  await expect(page.getByRole("radio", { name: "Saya sendiri" })).toHaveAttribute("aria-checked", "true");
  await fromNewIp(page);
  await page.getByRole("button", { name: "Kirim pesanan" }).first().click();

  // The Kode Masuk step opens inline under the form, with the CS line below it.
  await expect(page.getByText("Masukkan Kode Masuk")).toBeVisible();
  await expect(page.getByTestId("kode-masuk-cs")).toContainText("Tidak punya email? Minta bantuan CS");
  await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
  await expect(page.getByTestId("kode-masuk-email")).toHaveText(email.toLowerCase());

  await page.getByLabel("Kode Masuk").fill(await lastEmailCode(request, email.toLowerCase(), "Kode Masuk"));
  await page.getByRole("button", { name: "Kirim pesanan" }).click();

  // The order page: its Nomor Pemesanan, the status timeline and the deadline.
  await expect(page).toHaveURL(/\/pesanan\/MKM-\d{4}-\d{6}$/);
  await expect(page.getByTestId("nomor-pemesanan")).toHaveText(/^MKM-2026-\d{6}$/);
  await expect(page.locator("[data-slot=status-badge]")).toHaveText("Diajukan");
  await expect(page.getByRole("list").getByText("Diajukan")).toBeVisible();
  await expect(page.getByRole("list").getByText("Dimakamkan")).toBeVisible();
  await expect(page.getByTestId("konfirmasi-paling-lambat")).toContainText("mengonfirmasi paling lambat");
  await expect(page.getByText("Belum ada yang dibayar.")).toBeVisible();
  await expect(page.getByText("Siti Aminah")).toBeVisible();

  // The Kode Masuk created the Akun: the order is now readable in Akun Saya.
  await page.goto("/akun");
  await expect(page.getByTestId("akun-login-email")).toHaveText(email.toLowerCase());
});
