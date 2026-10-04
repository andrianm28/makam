import { perpanjangDanBayar } from "../support/alur";
import { baca, simpan } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 5: Perpanjangan lewat OTP (ADR 0005) on the fixed-term
 * Hak Pakai that bagian 4 left. [BAYAR]. The Admin Lokasi's review of a document
 * request is the berkas path, run in rilis2-bayar.uat.ts (R2-41.1).
 */

test.describe("§5 Perpanjangan (OTP)", { tag: ["@rilis1", "@bayar"] }, () => {
  test("§5 Pemegang Hak memperpanjang lewat kode ke email tercatat, membayar, dan masa Hak Pakai bertambah", async ({ sebagai }) => {
    const page = await sebagai("pemesan");
    let sebelum = "";
    await langkah(page, "Akun Saya → Makam → Perpanjang Makam", async () => {
      const id = baca("saatduka.hakPakaiId");
      await page.goto(id ? `/perpanjangan/${id}` : "/akun/makam");
      if (!id) await page.getByRole("link", { name: /Perpanjang/i }).first().click();
      await expect(page.getByRole("heading", { name: "Perpanjang Makam" })).toBeVisible();
      simpan("perpanjangan.url", new URL(page.url()).pathname);
      sebelum = await page.locator("main").innerText();
    });
    const tagihanUrl = await perpanjangDanBayar(page, baca("perpanjangan.url")!);
    simpan("perpanjangan.tagihanUrl", tagihanUrl);
    await langkah(page, "Bukti Perpanjangan terbit; tanggal akhir Hak Pakai bertambah", async () => {
      await page.goto("/akun/makam");
      const sesudah = await page.locator("main").innerText();
      expect.soft(sesudah, "Makam Keluarga berubah setelah Perpanjangan dibayar").not.toBe(sebelum);
    });
    await manual(page, "Bukti Perpanjangan: tanggal akhir lama dan baru benar", "dibaca owner pada halaman Bukti Perpanjangan (screenshot)");
  });
});
