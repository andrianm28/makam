import { kunjungi } from "../support/halaman";
import { baca } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 8: Admin Platform (back office). The desks are opened
 * and read for errors; the Tagihan found by its number is the one of bagian 2.
 */

test.describe("§8 Admin Platform", { tag: ["@rilis1"] }, () => {
  test("§8 Admin Platform membuka Tagihan dari pencarian dan semua meja back office tanpa galat", async ({ sebagai }) => {
    const page = await sebagai("admin-platform");
    const nomorTagihan = baca("terencana.nomorTagihan");
    await langkah(page, "Tagihan: cari menurut nomor dan buka detail", async () => {
      await page.goto("/staf/admin-platform/tagihan");
      const cari = page.getByLabel("Nomor Tagihan atau nomor pesanan");
      await cari.fill(nomorTagihan ?? baca("terencana.nomor") ?? "TGH");
      await page.getByRole("button", { name: "Cari" }).click();
      const buka = page.getByRole("listitem").getByRole("link", { name: "Buka" }).first();
      await expect(buka).toBeVisible();
      await buka.click();
      await expect(page).toHaveURL(/\/staf\/admin-platform\/tagihan\/[0-9a-f-]{36}$/);
      await expect(page.getByRole("heading", { name: /^Tagihan / })).toBeVisible();
    });
    await kunjungi(page, "Antrean Admin Platform", "/staf/admin-platform/antrean", /Antrean/);
    await kunjungi(page, "Tagihan lewat jatuh tempo (chasing)", "/staf/admin-platform/tagihan-lewat-jatuh-tempo", /Tagihan/);
    await kunjungi(page, "Laporan", "/staf/admin-platform/laporan", /Laporan/);
    await kunjungi(page, "Transfer keluar (Pencairan dan pengembalian dana)", "/staf/admin-platform/transfer", /Transfer/);
    await kunjungi(page, "Pengembalian dana", "/staf/admin-platform/pengembalian", /Pengembalian/);
    await kunjungi(page, "Penilaian dan Keluhan", "/staf/admin-platform/penilaian", /Penilaian/);
    await kunjungi(page, "Pengaturan Operator", "/staf/admin-platform/pengaturan-operator", /Pengaturan Operator/);
    await kunjungi(page, "Staf: undang peran", "/staf/admin-platform/staf", /Staf/);

    await manual(page, "Catat pembayaran manual / tetapkan Harga Khusus / batalkan pembayaran langsung", "mengubah Tagihan nyata; dikerjakan owner pada Tagihan uji");
    await manual(page, "Pengembalian: setujui refund (catatan fee bila Harga Khusus), transfer, Bukti Pengembalian Dana", "dikerjakan setelah pembatalan §10; owner memeriksa bukti");
    await manual(page, "Pencairan, Laporan angka dan Audit Log platform", "angka dibaca owner dari screenshot (Audit Log platform belum ada halamannya)");
  });
});
