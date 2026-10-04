import { bukaDataSaatDuka, perpanjangDanBayar } from "../support/alur";
import { bayarDenganQris } from "../support/bayar";
import { DATA, bukaBarisAntreanLokasi, isiDataPemesan, lokasiIdDariNama, persis, pilihLayananCheckout, pilihOpsi } from "../support/halaman";
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
    await bukaBarisAntreanLokasi(page, lokasiId, /^Layanan (hari ini|akan datang)$/, nomor);
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
    await manual(page, "Keluhan: baris 'Keluhan' (Tier 1) muncul di Antrean Admin Platform dan keputusan (tolak, kerjakan ulang, refund) tersedia", "dibuka owner di Antrean Admin Platform; runner tidak memegang keputusan");
    await manual(page, "Admin Lokasi membalas di thread pekerjaan dan Pemesan menerima pesan tanpa isi di email", "dicek owner; thread Admin Lokasi sama dengan thread Pemesan");
    await manual(page, "Layanan Terlambat (target + 2 hari tanpa bukti) muncul sebagai baris 'Layanan terlambat' di Antrean Lokasi", "butuh dua hari lewat; dicek di minggu uji berikutnya");
    await manual(page, "Thread menjadi baca-saja saat jendela Keluhan tutup; batal sebelum H-1 menahan Biaya Layanan Platform", "butuh waktu 3×24 jam atau pesanan baru; dicek di minggu uji berikutnya");
  });

  /*
   * Layanan saat checkout (tiket 53), the three places a booking offers it. (c) pays, as the checklist asks
   * ("bayar salah satunya sampai Lunas"). (a) and (b) walk to the picker, choose a Layanan and stop before Kirim:
   * the orders they would send are the ones sections 2 and 4 already send, and what the Tagihan then holds is
   * a step for a person (manual), not for this script.
   */
  test("§11 Layanan saat checkout (a) Saat Duka: Layanan hari-H ditawarkan di Data & kirim dan bisa dipilih", async ({ sebagai }) => {
    const page = await sebagai("pemesan");
    await langkah(page, "Saat Duka, Data & kirim: pilih Layanan hari-H", async () => {
      await bukaDataSaatDuka(page);
      await isiDataPemesan(page);
      await pilihLayananCheckout(page, "hari-h");
      await expect.soft(page.getByText(/Layanan hari-H/).first()).toBeVisible();
    });
    await manual(page, "Saat Duka: yang ditawarkan hanya item hari-H; barisnya masuk Tagihan bayar-belakang yang sama dan Tagihan tetap bayar-belakang", "dibaca owner pada Tagihan sesudah Admin Lokasi mengonfirmasi; runner berhenti sebelum Kirim pesanan");
  });

  test("§11 Layanan saat checkout (b) Terencana: untuk satu petak ditawarkan item petak-kosong dan subtotalnya tampil", async ({ sebagai }) => {
    const page = await sebagai("pemesan");
    const petak = page.locator(`button[aria-label^="${DATA.petakTerencanaLayanan()}"]`);
    await langkah(page, "Terencana: pilih satu Petak, Data & kirim: pilih Layanan petak-kosong", async () => {
      await page.goto("/pesan-makam/terencana");
      await page.getByRole("link", { name: persis(DATA.lokasiTerencana()) }).first().click();
      await petak.click();
      await page.getByRole("button", { name: "Lanjut" }).click();
      await expect(page.getByRole("heading", { name: "Data & kirim" })).toBeVisible();
      await pilihLayananCheckout(page, "petak-kosong");
      await expect(page.getByTestId("total-layanan")).toContainText("Rp");
    });
    await manual(page, "Terencana: yang ditawarkan hanya item petak-kosong; Tagihan bayar-dulu dengan jatuh tempo paling awal memuat barisnya", "dibaca owner pada Tagihan sesudah Admin Lokasi mengonfirmasi; runner berhenti sebelum Kirim pesanan");
  });

  test("§11 Layanan saat checkout (c) Perpanjangan: Tambah Layanan di Tagihan Perpanjangan, satu Biaya Layanan Platform, bayar sampai Lunas", async ({ sebagai }) => {
    const hakPakai = wajib("saatduka.hakPakaiId", "§4 Saat Duka");
    const page = await sebagai("pemesan");
    const tagihanUrl = await perpanjangDanBayar(page, `/perpanjangan/${hakPakai}`, { tambahLayanan: true });
    await langkah(page, "Tagihan Perpanjangan: baris Layanan dan satu Biaya Layanan Platform", async () => {
      await page.goto(tagihanUrl);
      await expect.soft(page.getByText("Biaya Layanan Platform")).toHaveCount(1);
      await expect.soft(page.getByText(/Layanan/).first()).toBeVisible();
    });
    await manual(page, "Perpanjangan: jatuh tempo tetap 3×24 jam dan tanggal target Layanan paling cepat lead time setelah jatuh tempo itu", "dibaca owner pada Tagihan dan halaman pesanan Layanan (screenshot)");
  });
});
