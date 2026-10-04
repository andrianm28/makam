import { perpanjangDanBayar } from "../support/alur";
import { envOpsional } from "../support/halaman";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 5: Perpanjangan lewat OTP (ADR 0005). [BAYAR]. The Admin Lokasi's review of a document
 * request is the berkas path, run in rilis2-bayar.uat.ts (R2-41.1).
 *
 * A Perpanjangan is open only from 3 months before the end date to the end of the Masa Tenggang (spec, Perpanjangan;
 * `BULAN_SEBELUM_BERAKHIR`), so the 10-year Hak Pakai bagian 4 leaves answers "bisa diperpanjang mulai <tanggal>" and
 * offers no term, and a Terencana Hak Pakai has no end date (Wakaf Al-Ikhlas is selamanya: no Perpanjang link at all).
 * The journey runs on a Hak Pakai of the Pemesan that is inside the window (checklist P8), named in
 * UAT_HAK_PAKAI_PERPANJANGAN. It pays, so the record is used up: the end date moves out by a term.
 */

test.describe("§5 Perpanjangan (OTP)", { tag: ["@rilis1", "@bayar"] }, () => {
  test("§5 Pemegang Hak memperpanjang lewat kode ke email tercatat, membayar, dan masa Hak Pakai bertambah", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_PERPANJANGAN");
    test.skip(
      !hakPakai,
      "Isi UAT_HAK_PAKAI_PERPANJANGAN: id Hak Pakai berjangka milik persona Pemesan yang Perpanjangannya sedang terbuka (tanggal akhir paling lama 3 bulan lagi, atau lewat dalam masa tenggang). Hak Pakai baru dari bagian 4 berumur 10 tahun dan baru bisa diperpanjang 3 bulan sebelum berakhir; Hak Pakai Terencana di Wakaf Al-Ikhlas berlaku selamanya.",
    );
    const page = await sebagai("pemesan");
    const halaman = `/perpanjangan/${hakPakai}`;
    let sebelum = "";
    await langkah(page, "Akun Saya → Makam → Perpanjang Makam", async () => {
      await page.goto("/akun/makam");
      sebelum = await page.locator("main").innerText();
      const tautan = page.locator(`a[href="${halaman}"]`);
      await expect(tautan, "tab Makam Keluarga persona Pemesan memuat Hak Pakai itu dengan tautan Perpanjang Makam").toBeVisible();
      await tautan.click();
      await expect(page.getByRole("heading", { name: "Perpanjang Makam" })).toBeVisible();
    });
    await perpanjangDanBayar(page, halaman);
    await langkah(page, "Bukti Perpanjangan terbit; tanggal akhir Hak Pakai bertambah", async () => {
      await page.goto("/akun/makam");
      const sesudah = await page.locator("main").innerText();
      expect.soft(sesudah, "Makam Keluarga berubah setelah Perpanjangan dibayar").not.toBe(sebelum);
    });
    await manual(page, "Admin Lokasi memverifikasi permohonan Perpanjangan (setuju, tolak, minta perbaikan) di halaman Perpanjangan", "jalur berkas diskrip di R2-41.1 dan butuh Hak Pakai tanpa email (P8c); jalur OTP tidak melewati Admin Lokasi");
    await manual(page, "Bukti Perpanjangan: tanggal akhir lama dan baru benar", "dibaca owner pada halaman Bukti Perpanjangan (screenshot)");
  });
});
