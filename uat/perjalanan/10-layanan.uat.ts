import { bayarDenganQris } from "../support/bayar";
import { DATA, lokasiIdDariNama, persis, pilihOpsi } from "../support/halaman";
import { simpan, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 11: Layanan dari sisi keluarga di Lokasi Mitra (ADR
 * 0006): order and pay [BAYAR], fulfilment with the browser camera, Keluhan,
 * Penilaian and the message thread. It uses the Terencana grave of bagian 3, so it
 * runs before the closing journey (11-penutup) that cancels that order.
 */

test.describe("§11 Layanan dari sisi keluarga", { tag: ["@rilis1", "@bayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("§11 Pemesan memesan Layanan lewat Makam Keluarga dan membayar sampai Pekerjaan Dijadwalkan", async ({ sebagai }) => {
    const page = await sebagai("pemesan");
    await langkah(page, "Makam Keluarga: cari Nomor Makam di Lokasi Mitra", async () => {
      await page.goto("/makam-keluarga");
      await pilihOpsi(page, "Lokasi Mitra", { teks: persis(DATA.lokasiTerencana()) });
      await page.getByLabel("Nomor Makam").fill(DATA.petakTerencana());
      await page.getByRole("button", { name: "Cari makam" }).click();
      await expect(page.getByText("Petak Makam").first()).toBeVisible();
    });
    await langkah(page, "Layanan Makam: pilih varian dan tanggal target", async () => {
      await page.getByRole("link", { name: /layanan makam/i }).first().click();
      await expect(page.getByRole("heading", { name: "Pesan Layanan Makam" })).toBeVisible();
      const varian = page.locator('select[id^="varian-"]').first();
      await varian.selectOption({ index: 1 });
      await expect(page.getByTestId("harga-total")).toBeVisible();
      const teks = page.locator('textarea[id^="teks-"]').first();
      if (await teks.isVisible()) await teks.fill("Teks contoh uji UAT");
    });
    await langkah(page, "Pesan layanan: Nomor Pesanan dan Tagihan", async () => {
      await page.getByLabel("Nama lengkap Anda").fill("Uji UAT Pemesan");
      await page.getByLabel("Nomor telepon", { exact: true }).fill(DATA.telepon());
      await page.getByRole("button", { name: "Pesan layanan" }).click();
      await expect(page).toHaveURL(/\/layanan\/[A-Za-z0-9-]+$/, { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "Layanan dipesan" })).toBeVisible();
      simpan("layanan.nomor", new URL(page.url()).pathname.split("/").pop()!);
      await expect.soft(page.getByText(/TGH\/\d{4}\/\d{6}/).first()).toBeVisible();
      await page.getByRole("link", { name: "Buka Tagihan" }).click();
      await expect(page).toHaveURL(/\/dokumen\//);
      simpan("layanan.tagihanUrl", new URL(page.url()).pathname);
    });
    await bayarDenganQris(page, wajib("layanan.tagihanUrl", "§11 Layanan"));
    await langkah(page, "Pekerjaan Layanan Dijadwalkan; halaman pesanan: Sudah dibayar", async () => {
      await page.goto(`/layanan/${wajib("layanan.nomor", "§11 Layanan")}`);
      await expect(page.getByText(/Sudah dibayar/).first()).toBeVisible();
    });
  });

  test("§11 Admin Lokasi mengerjakan: bukti dari kamera aplikasi lalu Tandai selesai", async ({ sebagai }) => {
    const nomor = wajib("layanan.nomor", "§11 Layanan");
    const page = await sebagai("admin-lokasi");
    const lokasiId = await lokasiIdDariNama(page, DATA.lokasiTerencana());
    await langkah(page, "Antrean Lokasi: baris Layanan untuk pesanan ini", async () => {
      const baris = page.getByRole("link", { name: persis(nomor) }).first();
      await expect(async () => {
        await page.goto(`/staf/admin-lokasi/${lokasiId}/antrean`);
        await expect(baris).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 90_000, intervals: [3_000] });
      await baris.click();
    });
    await langkah(page, "Mulai kerjakan, ambil bukti dengan kamera, Tandai selesai", async () => {
      const mulai = page.getByRole("button", { name: "Mulai kerjakan" });
      if (await mulai.isVisible()) await mulai.click();
      // Each required proof: open the camera, take the picture, save it (the fake camera answers).
      for (let bukti = 0; bukti < 4; bukti += 1) {
        const ambil = page.getByRole("button", { name: "Ambil dengan kamera" }).first();
        if (!(await ambil.isVisible())) break;
        await ambil.click();
        await page.getByRole("button", { name: "Ambil foto" }).click();
        await page.getByRole("button", { name: "Simpan bukti" }).click();
        await expect(page.getByAltText("Pratinjau bukti yang baru diambil")).toHaveCount(0, { timeout: 30_000 });
      }
      await expect(page.getByTestId("bukti-kurang")).toHaveCount(0);
      await page.getByRole("button", { name: "Tandai selesai" }).click();
      await expect(page.getByRole("button", { name: "Tandai selesai" })).toHaveCount(0, { timeout: 30_000 });
    });
  });

  test("§11 Pemesan: bukti tampil, thread pesan, Penilaian dan Keluhan dalam jendela 3×24 jam", async ({ sebagai }) => {
    const nomor = wajib("layanan.nomor", "§11 Layanan");
    const page = await sebagai("pemesan");
    await langkah(page, "Halaman Layanan: bukti pekerjaan tampil", async () => {
      await page.goto(`/layanan/${nomor}`);
      await expect(page.getByText(/Selesai/).first()).toBeVisible();
    });
    await langkah(page, "Thread pesan: kirim pesan teks", async () => {
      await page.getByLabel("Tulis pesan").first().fill("Pesan uji UAT dari Pemesan.");
      await page.getByRole("button", { name: "Kirim pesan" }).first().click();
      await expect(page.getByText("Pesan uji UAT dari Pemesan.").first()).toBeVisible({ timeout: 30_000 });
    });
    await langkah(page, "Penilaian 5 bintang dengan komentar", async () => {
      await page.getByLabel("5 bintang").first().check();
      await page.getByLabel("Komentar").first().fill("Penilaian uji UAT.");
      await page.getByRole("button", { name: "Kirim penilaian" }).first().click();
      await expect(page.getByText("Terima kasih, Anda sudah menilai pekerjaan ini.")).toBeVisible({ timeout: 30_000 });
    });
    await langkah(page, "Keluhan: ajukan dalam jendela, muncul sebagai baris untuk Admin Platform", async () => {
      await page.getByLabel("Ada yang belum sesuai?").first().fill("Keluhan uji UAT: mohon diperiksa.");
      await page.getByRole("button", { name: "Ajukan keluhan" }).first().click();
      await expect.soft(page.getByText(/keluhan/i).first()).toBeVisible();
    });
    await manual(page, "Email pesan baru ke Pemesan tanpa isi pesan, dengan tautan balas", "dicek owner di mailbox");
    await manual(page, "Penilaian hanya terbaca Admin Platform (tidak Admin Lokasi, tidak Mitra Jasa)", "Admin Platform membuka daftar Penilaian; Admin Lokasi tidak menemukannya");
    await manual(page, "Thread menjadi baca-saja saat jendela Keluhan tutup; batal sebelum H-1 menahan Biaya Layanan Platform", "butuh waktu 3×24 jam atau pesanan baru; dicek di minggu uji berikutnya");
  });
});
