import { simpan, wajib } from "../support/keadaan";
import { DATA, persis } from "../support/halaman";
import { bayarDenganQris } from "../support/bayar";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 3: pembayaran QRIS di sandbox SumoPod (ticket 61), on
 * the Terencana Tagihan of bagian 2. A [BAYAR] journey: it must run on staging
 * before the SumoPod webhook moves to makam.co.id.
 */

test.describe("§3 Pembayaran QRIS (sandbox)", { tag: ["@rilis1", "@bayar"] }, () => {
  test("§3 Bayar Tagihan Terencana lewat QRIS: Lunas, Bukti Pembayaran, order Aktif, Hak Pakai di Makam Keluarga", async ({ sebagai }) => {
    const nomor = wajib("terencana.nomor", "§2 Terencana");
    const page = await sebagai("pemesan");
    const total = await bayarDenganQris(page, wajib("terencana.tagihanUrl", "§2 Terencana"));
    simpan("terencana.total", String(total));

    await langkah(page, "Order Aktif: Bukti Pemesanan terbit", async () => {
      await page.goto(`/pesanan/${nomor}`);
      await expect(page.getByTestId("bukti-pemesanan")).toBeVisible();
    });
    await langkah(page, "Hak Pakai tampil di Makam Keluarga Akun Saya", async () => {
      await page.goto("/akun/makam");
      await expect(page.getByText(persis(DATA.petakTerencana())).first()).toBeVisible();
    });
    await manual(page, "Webhook payment.completed diterima app (2xx di dashboard SumoPod, tab Webhooks)", `total yang dibayar Rp ${total}`);
    await manual(page, "Uang masuk tercatat benar: net = total − fee SumoPod", "dicek owner di dashboard SumoPod dan Laporan Admin Platform");
  });
});
