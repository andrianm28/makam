import { DATA, kunjungi, lokasiIdDariNama } from "../support/halaman";
import { baca } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 6: job desk Admin Lokasi. Every desk is opened and read
 * for errors, with a screenshot for the owner's spot check; what the earlier
 * journeys already did (confirm, Catat Pemakaman, Layanan) is not repeated, and
 * what edits shared data (the Denah, the working hours) is left to a person.
 */

test.describe("§6 Job desk Admin Lokasi", { tag: ["@rilis1"] }, () => {
  test("§6 Admin Lokasi membuka semua meja kerja Lokasi tanpa galat; Audit Log mencatat tulisan staf", async ({ sebagai }) => {
    const page = await sebagai("admin-lokasi");
    const lokasiId = await lokasiIdDariNama(page, DATA.lokasiTerencana());
    const dasar = `/staf/admin-lokasi/${lokasiId}`;

    await kunjungi(page, "Antrean Lokasi (konfirmasi/tolak, Layanan, Pembatalan, Perpanjangan)", `${dasar}/antrean`, /Antrean Lokasi/);
    await kunjungi(page, "Denah: daftar Blok", `${dasar}/denah`, /Denah/);
    await langkah(page, "Denah: buka editor satu Blok (Petak, Kavling, Jalan, Pintu Masuk)", async () => {
      const blok = page.locator(`a[href^="${dasar}/denah/"]`).first();
      if (await blok.isVisible()) {
        await blok.click();
        await expect(page.getByRole("heading").first()).toBeVisible();
      }
    });
    await kunjungi(page, "Jam Operasional dan Tanggal Tutup", `${dasar}/jam-operasional`, /Jam Operasional/);
    await kunjungi(page, "Tagihan lewat jatuh tempo (chasing) di Lokasi", `${dasar}/tagihan-lewat-jatuh-tempo`, /Tagihan/);
    await kunjungi(page, "Audit Log Lokasi", `${dasar}/audit-log`, /Audit Log/);
    await langkah(page, "Audit Log mencatat konfirmasi pesanan dari bagian 2", async () => {
      // The log lists the oldest entry first, 15 to a page, so on a Lokasi with more than 15 entries today's confirmation is
      // on the last page, not on the one that opens. The search box finds it (it matches the "Perubahan" column), and the
      // Tagihan the confirmation issued picks out the one of bagian 2.
      const kataCari = "dikonfirmasi";
      await page.getByRole("searchbox", { name: "Cari oleh, perubahan atau alasan" }).fill(kataCari);
      const konfirmasi = page.getByRole("row", { name: /Pesanan Terencana dikonfirmasi/ });
      const nomorTagihan = baca("terencana.nomorTagihan");
      await expect.soft(nomorTagihan ? konfirmasi.filter({ hasText: nomorTagihan }).first() : konfirmasi.first(), "Entri Audit konfirmasi pesanan bagian 2").toBeVisible();
    });

    await manual(page, "Denah: buat/edit Blok, tandai Petak/Kavling/Jalan/Bukan Petak/Pintu Masuk, clearing Petak (Perlu Verifikasi)", "mengubah data bersama; dikerjakan dan dilihat owner");
    await manual(page, "Jam Operasional, Tanggal Tutup dan Kontak Siaga", "mengubah data bersama; dikerjakan dan dilihat owner");
    await manual(page, "Catat dibayar langsung ke Lokasi (unggah bukti); Admin Platform bisa membatalkan bila keliru", "perlu Tagihan belum lunas; dicoba owner pada pesanan baru");
    await manual(page, "Pembatalan (Terencana) dan Pengembalian Hak Pakai (kelola permintaan)", "pembatalan dijalankan di perjalanan penutup (§10)");
  });
});
