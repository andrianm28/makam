import { bukaTagihanDanBayar, konfirmasiTpuSaatDuka, pesanTpuSaatDuka } from "../support/alur";
import { bayarDenganQris } from "../support/bayar";
import { DATA, kunjungi } from "../support/halaman";
import { simpan, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Rilis 3, the [BAYAR] items of .scratch/makam-v1-build/uat-rilis-2-3-checklist.md
 * (the TPU side): each pays through the sandbox, so each must run on staging before
 * the switch. Needs the TPU data of the checklist's P1 to P6. Items whose later steps
 * are not scripted yet say so in the test (see the ticket's Comments).
 */

test.describe("Rilis 3 [BAYAR]", { tag: ["@rilis3", "@bayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("R3-45.1 Saat Duka TPU: konfirmasi Admin Platform, Tagihan bayar-belakang dibayar, tanpa Setor Retribusi untuk Rp 0 (dengan Layanan hari-H, R3-56.2)", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const nomor = await pesanTpuSaatDuka(pemesan, { layananHariH: true });
    simpan("tpu.saatDuka.nomor", nomor);
    await konfirmasiTpuSaatDuka(await sebagai("admin-platform"), nomor);
    await langkah(pemesan, "Halaman pengurusan: dikonfirmasi, Tagihan bayar-belakang terbit", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("link", { name: /TGH\/\d{4}\/\d{6}/ }).first()).toBeVisible({ timeout: 30_000 });
      await pemesan.getByRole("link", { name: /TGH\/\d{4}\/\d{6}/ }).first().click();
    });
    await expect(pemesan).toHaveURL(/\/dokumen\//);
    await bayarDenganQris(pemesan, new URL(pemesan.url()).pathname);
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Setor Retribusi: tidak ada baris untuk Retribusi Rp 0", "/staf/admin-platform/setor-retribusi", /Setor Retribusi/);
    await expect.soft(admin.getByText(nomor)).toHaveCount(0);
    await manual(admin, "Nama dan kontak Admin Platform yang mengambil baris terlihat di halaman keluarga", "dibaca owner pada screenshot halaman pengurusan");
  });

  test("R3-46.1 dan R3-53.1 Pesanan TPU terbayar dibatalkan sebelum IPTM Diajukan: Dibatalkan dan permintaan refund", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const nomor = await pesanTpuSaatDuka(pemesan, { layananHariH: true });
    await konfirmasiTpuSaatDuka(await sebagai("admin-platform"), nomor);
    await langkah(pemesan, "Buka dan bayar Tagihan pesanan kedua", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await pemesan.getByRole("link", { name: /TGH\/\d{4}\/\d{6}/ }).first().click();
    });
    await bayarDenganQris(pemesan, new URL(pemesan.url()).pathname);
    await langkah(pemesan, "Batalkan pengurusan sebelum IPTM Diajukan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await pemesan.getByRole("button", { name: "Batalkan pengurusan" }).click();
      await expect(pemesan.getByText("Dibatalkan").first()).toBeVisible({ timeout: 30_000 });
    });
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Pengembalian dana: permintaan refund pesanan yang dibatalkan", "/staf/admin-platform/pengembalian", /Pengembalian/);
    await expect.soft(admin.getByText(nomor).first()).toBeVisible();
    await manual(admin, "Jumlah refund benar: seluruh pembayaran sebelum Dimakamkan; Layanan hari-H dikembalikan kecuali Sedang Dikerjakan", "dihitung owner dari rincian Tagihan dan screenshot");
  });

  test("R3-47.1 Pengurusan IPTM (hanya pengajuan): dokumen lengkap, Tagihan bayar-dulu dibayar, baru lalu baris Ambil surat pengantar", async ({ sebagai }) => {
    test.fixme(true, "Hanya sampai pengajuan dan unggah dokumen: pemeriksaan dokumen, pembayaran, penerbitan IPTM belum diskrip (selector halaman Pengurusan belum diverifikasi); lihat Comments tiket 110");
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Sudah dimakamkan? Kami urus IPTM-nya: isi data pengajuan", async () => {
      await pemesan.goto("/pesan-makam/pengurusan-iptm");
      await pemesan.locator('select[name="tpuId"]').selectOption({ index: 1 });
      await pemesan.locator('input[name="pemesanName"]').fill("Uji UAT Pemesan");
      await pemesan.locator('input[name="phoneNumber"]').fill(DATA.telepon());
      await pemesan.locator('input[name="almarhumName"]').fill("Almarhum IPTM Uji UAT");
      await pemesan.locator('input[name="tanggalWafat"]').fill("2026-09-01");
    });
  });

  test("R3-47.2 Penolakan PTSP: perbaikan tanpa Tagihan baru, final dengan refund penuh", async () => {
    test.fixme(true, "Belum diskrip: butuh pesanan R3-47.1 sampai IPTM Diajukan; lihat Comments tiket 110");
  });

  test("R3-48.1 Perpanjangan TPU: dokumen diperiksa, Tagihan bayar-dulu dibayar, IPTM Terbit memperbarui Makam TPU", async () => {
    test.fixme(true, "Belum diskrip: butuh Makam TPU dengan IPTM berakhir dalam 3 bulan dan halaman Perpanjangan TPU yang belum diverifikasi; lihat Comments tiket 110");
  });

  test("R3-56.1 Layanan di TPU: deskripsi makam, harga DKI tanpa Biaya Layanan Platform, bayar-dulu dibayar, Pekerjaan Dijadwalkan", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Layanan TPU: TPU, blok dan nomor makam, Almarhum, varian", async () => {
      await pemesan.goto("/layanan/tpu");
      const tpu = pemesan.getByLabel("TPU", { exact: true });
      await tpu.selectOption({ index: 1 });
      await pemesan.getByLabel("Blok dan nomor makam").fill("Blok C-7 No. 21");
      await pemesan.getByLabel("Nama almarhum / almarhumah").fill("Almarhum Layanan TPU Uji UAT");
      const varian = pemesan.locator('select[id^="varian-"]').first();
      await varian.selectOption({ index: 1 });
      const teks = pemesan.locator('textarea[id^="teks-"]').first();
      if (await teks.isVisible()) await teks.fill("Teks contoh uji UAT");
      await expect(pemesan.getByTestId("harga-total")).toBeVisible();
      await expect.soft(pemesan.getByText(/tanpa biaya layanan platform/i)).toBeVisible();
    });
    await langkah(pemesan, "Pesan layanan (sudah masuk): Tagihan bayar-dulu", async () => {
      await pemesan.getByLabel("Nama lengkap Anda").fill("Uji UAT Pemesan");
      await pemesan.getByLabel("Nomor telepon", { exact: true }).fill(DATA.telepon());
      await pemesan.getByRole("button", { name: "Pesan layanan" }).click();
      await expect(pemesan).toHaveURL(/\/layanan\/[A-Za-z0-9-]+$/, { timeout: 30_000 });
      simpan("tpu.layanan.nomor", new URL(pemesan.url()).pathname.split("/").pop()!);
    });
    await bukaTagihanDanBayar(pemesan);
    await langkah(pemesan, "Halaman Layanan: Sudah dibayar, Pekerjaan Dijadwalkan", async () => {
      await pemesan.goto(`/layanan/${wajib("tpu.layanan.nomor", "R3-56.1")}`);
      await expect(pemesan.getByText(/Sudah dibayar|Dijadwalkan/).first()).toBeVisible();
    });
  });
});
