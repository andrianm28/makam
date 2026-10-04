import { baca, simpan, wajib } from "../support/keadaan";
import { DATA, bukaBarisAntreanLokasi, lokasiIdDariNama, nomorPemesananDi, nomorTagihanDi, persis } from "../support/halaman";
import { langkah, manual } from "../support/langkah";
import { emailPersona } from "../support/persona";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 2: journey Terencana di Lokasi Mitra, dari daftar
 * Lokasi sampai Tagihan terbit. Payment is bagian 3 (03-pembayaran.uat.ts).
 */

test.describe("§2 Terencana (Lokasi Mitra)", { tag: ["@rilis1"] }, () => {
  test.describe.configure({ mode: "serial" });
  const petak = (page: import("@playwright/test").Page) => page.locator(`button[aria-label^="${DATA.petakTerencana()}"]`);

  test("§2 Pemesan memilih Lokasi dan Petak di Denah, mengirim pesanan, dan Petak ditahan", async ({ sebagai, anonim }) => {
    const page = await sebagai("pemesan");
    const lokasi = DATA.lokasiTerencana();

    await langkah(page, "Kartu Lokasi tampil dan ada filter kota", async () => {
      await page.goto("/pesan-makam/terencana");
      await expect(page.getByRole("link", { name: persis(lokasi) }).first()).toBeVisible();
      await expect.soft(page.getByRole("group", { name: "Kota" })).toBeVisible();
    });
    await langkah(page, "Pilih Lokasi: Denah dengan Petak Tersedia", async () => {
      await page.getByRole("link", { name: persis(lokasi) }).first().click();
      await expect(petak(page)).toBeVisible({ timeout: 30_000 });
      await expect(petak(page)).toHaveAttribute("aria-label", /Tersedia/i);
    });
    await langkah(page, "Pilih Petak lalu Lanjut", async () => {
      await petak(page).click();
      await expect(petak(page)).toHaveAttribute("aria-pressed", "true");
      await page.getByRole("button", { name: "Lanjut" }).click();
      await expect(page.getByRole("heading", { name: "Data & kirim" })).toBeVisible();
    });
    await langkah(page, "Data & kirim: isi data lalu Kirim pesanan (sudah masuk: tanpa Kode Masuk lagi)", async () => {
      await page.getByLabel("Nama lengkap", { exact: true }).fill("Uji UAT Pemesan");
      await page.getByLabel("Nomor telepon", { exact: true }).fill(DATA.telepon());
      const email = page.getByLabel("Email", { exact: true });
      if ((await email.isEditable()) && !(await email.inputValue())) await email.fill(emailPersona("pemesan"));
      await page.getByRole("button", { name: /Kirim pesanan/ }).click();
      await expect(page.getByRole("heading", { name: "Pesanan terkirim" })).toBeVisible({ timeout: 30_000 });
    });
    await langkah(page, "Pesanan terkirim: Nomor Pemesanan", async () => {
      const tautan = (await page.getByRole("link", { name: "Ikuti pesanan" }).getAttribute("href")) ?? "";
      const nomor = nomorPemesananDi(tautan || (await page.locator("main").innerText()));
      simpan("terencana.nomor", nomor);
      await expect(page.getByText(nomor).first()).toBeVisible();
    });

    const publik = await anonim();
    await langkah(publik, "Denah publik: Petak itu Dipesan dan tidak bisa dipilih lagi", async () => {
      await publik.goto("/pesan-makam/terencana");
      await publik.getByRole("link", { name: persis(lokasi) }).first().click();
      await expect(petak(publik)).toBeVisible({ timeout: 30_000 });
      await expect(petak(publik)).toHaveAttribute("aria-label", /Dipesan/i);
    });
  });

  test("§2 Admin Lokasi menemukan baris Konfirmasi Terencana dan mengonfirmasi pesanan", async ({ sebagai }) => {
    const nomor = wajib("terencana.nomor", "§2 Terencana");
    const page = await sebagai("admin-lokasi");
    const lokasiId = await lokasiIdDariNama(page, DATA.lokasiTerencana());
    simpan("lokasiId", lokasiId);
    await bukaBarisAntreanLokasi(page, lokasiId, "Konfirmasi Terencana", nomor);
    await langkah(page, "Konfirmasi pesanan: Tagihan terbit", async () => {
      await page.getByTestId("konfirmasi-terencana").click();
      await expect(page.getByTestId("konfirmasi-terencana")).toHaveCount(0, { timeout: 30_000 });
      const nomorTagihan = nomorTagihanDi(await page.locator("main").innerText());
      if (nomorTagihan) simpan("terencana.nomorTagihan", nomorTagihan);
      expect.soft(nomorTagihan, "Nomor Tagihan di halaman pesanan Admin Lokasi").toBeTruthy();
    });
  });

  test("§2 Pemesan melihat Tagihan terbit (Belum Dibayar, 24 jam) dan membukanya untuk dibayar", async ({ sebagai }) => {
    const nomor = wajib("terencana.nomor", "§2 Terencana");
    const page = await sebagai("pemesan");
    await langkah(page, "Halaman pesanan: dikonfirmasi, bayar sebelum Petak dilepas", async () => {
      await page.goto(`/pesanan/${nomor}`);
      await expect(page.getByTestId("terencana-dikonfirmasi")).toBeVisible();
    });
    await langkah(page, "Buka Tagihan: Belum Dibayar dan jatuh tempo", async () => {
      await page.getByTestId("bayar-terencana").click();
      await expect(page).toHaveURL(/\/dokumen\//);
      await expect(page.getByText("Belum Dibayar", { exact: true })).toBeVisible();
      await expect(page.getByText("Jatuh tempo").first()).toBeVisible();
      simpan("terencana.tagihanUrl", new URL(page.url()).pathname);
    });
    await manual(page, "Email Tagihan ke Pemesan tiba (berisi tautan bayar)", `dicek owner di mailbox; Petak ${baca("terencana.nomor") ?? ""} tetap ditahan sampai dibayar`);
  });
});
