import { DATA, PETAK_TERSEDIA } from "../support/halaman";
import { baca } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/* Checklist Rilis 1, bagian 9: negatif dan tepi. */

test.describe("§9 Negatif dan tepi", { tag: ["@rilis1"] }, () => {
  test("§9 Tagihan yang sudah Lunas tidak bisa dibayar ulang dan menunjuk ke Bukti", async ({ sebagai }) => {
    const url = baca("terencana.tagihanUrl");
    test.skip(!url, "Tagihan Terencana belum ada (jalankan §2 dan §3)");
    const page = await sebagai("pemesan");
    await langkah(page, "Buka Tagihan Lunas: tanpa tombol Bayar, ada Lihat Bukti Pembayaran", async () => {
      await page.goto(url!);
      await expect(page.getByText("Lunas", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: /^Bayar/ })).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Lihat Bukti Pembayaran" })).toBeVisible();
    });
  });

  test("§9 Petak yang sudah dipesan tidak bisa dipilih orang lain", async ({ anonim }) => {
    test.skip(!baca("terencana.nomor"), "Pesanan Terencana belum ada (jalankan §2)");
    const page = await anonim();
    await langkah(page, "Denah publik: Petak tidak bisa dipilih", async () => {
      await page.goto("/pesan-makam/terencana");
      // The whole name: the list also carries "<nama> (Contoh)" for each Lokasi.
      await page.getByRole("link", { name: DATA.lokasiTerencana(), exact: true }).first().click();
      const petak = page.locator(`button[aria-label^="${DATA.petakTerencana()}"]`);
      await expect(petak).toBeVisible({ timeout: 30_000 });
      await expect(petak).not.toHaveAttribute("aria-label", PETAK_TERSEDIA);
      await petak.click();
      await expect(petak).not.toHaveAttribute("aria-pressed", "true");
    });
  });

  test("§9 Total di atas Rp 10 juta ditolak dengan penjelasan cap QRIS", async ({ anonim }) => {
    const lokasi = DATA.lokasiDiAtasBatas();
    test.skip(!lokasi, "Isi UAT_LOKASI_DI_ATAS_BATAS dengan Lokasi yang Petaknya di atas Rp 10 juta");
    const page = await anonim();
    await langkah(page, "Terencana di Lokasi di atas cap: Lanjut tetap nonaktif", async () => {
      await page.goto("/pesan-makam/terencana");
      await page.getByRole("link", { name: lokasi!, exact: true }).first().click();
      const petak = page.locator('button[aria-pressed]').filter({ hasText: /./ }).first();
      await expect(petak).toBeVisible({ timeout: 30_000 });
      await petak.click();
      await expect(page.getByRole("button", { name: "Lanjut" })).toBeDisabled();
    });
    await manual(page, "Pesanan di atas batas Rp 10 juta ditolak dengan alasan yang jelas bagi keluarga", "runner hanya memastikan Lanjut nonaktif; kalimat alasannya dibaca owner (salinannya belum dipastikan, jadi tidak diasersi)");
  });

  test("§9 Kegagalan provider dan webhook expired/failed", async () => {
    await manual(null, "Bayar saat provider gagal: pesan ramah dan coba lagi, bukan halaman galat framework", "tidak bisa dibuat di sandbox; diuji owner dengan memutus akses ke provider");
    await manual(null, "Webhook payment.expired/failed: Tagihan tetap bisa Bayar; perlu_ditinjau bila nominal tak cocok", "dikirim ulang owner dari dashboard SumoPod (Webhooks → Resend)");
  });
});
