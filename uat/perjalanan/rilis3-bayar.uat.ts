import { bukaTagihanDanBayar, konfirmasiTpuSaatDuka, pesanTpuSaatDuka } from "../support/alur";
import { DATA, kunjungi, nomorPemesananDi, tanggalWib } from "../support/halaman";
import { ajukanIptm, catatPutusanPtsp, pesanPengurusanIptm, periksaDokumenLaluBayar, terbitkanIptm, unggahBerkasPengajuan } from "../support/iptm";
import { simpan, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Rilis 3, the [BAYAR] items of .scratch/makam-v1-build/uat-rilis-2-3-checklist.md
 * (the TPU side): each pays through the sandbox, so each must run on staging before
 * the switch. Needs the TPU data of the checklist's P1 to P6. Every item is scripted
 * end to end (the Pengurusan IPTM steps are in support/iptm.ts); the selectors were
 * read from the pages' source and have not run against a stack yet.
 */

test.describe("Rilis 3 [BAYAR]", { tag: ["@rilis3", "@bayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("R3-45.1 Saat Duka TPU: konfirmasi Admin Platform, Tagihan bayar-belakang dibayar, tanpa Setor Retribusi untuk Rp 0 (dengan Layanan hari-H, R3-56.2)", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const nomor = await pesanTpuSaatDuka(pemesan, { layananHariH: true });
    await konfirmasiTpuSaatDuka(await sebagai("admin-platform"), nomor);
    await langkah(pemesan, "Halaman pengurusan: dikonfirmasi, Layanan hari-H di pesanan, Tagihan bayar-belakang terbit", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("heading", { name: "Layanan hari-H" })).toBeVisible({ timeout: 30_000 });
      await expect(pemesan.getByRole("link", { name: /Buka Tagihan/ }).first()).toBeVisible();
    });
    await bukaTagihanDanBayar(pemesan);
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Setor Retribusi: tidak ada baris untuk Retribusi Rp 0", "/staf/admin-platform/setor-retribusi", /Setor Retribusi/);
    await expect.soft(admin.getByText(nomor)).toHaveCount(0);
    await manual(admin, "Nama dan kontak Admin Platform yang mengambil baris terlihat di halaman keluarga", "dibaca owner pada screenshot halaman pengurusan");
  });

  test("R3-46.1 dan R3-53.1 Pesanan TPU terbayar dibatalkan sebelum IPTM Diajukan: Dibatalkan dan permintaan refund", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const nomor = await pesanTpuSaatDuka(pemesan, { layananHariH: true });
    await konfirmasiTpuSaatDuka(await sebagai("admin-platform"), nomor);
    await langkah(pemesan, "Pesanan kedua dikonfirmasi: Layanan hari-H di pesanan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("heading", { name: "Layanan hari-H" })).toBeVisible({ timeout: 30_000 });
    });
    await bukaTagihanDanBayar(pemesan);
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

  test("R3-47.1 Pengurusan IPTM (hanya pengajuan): dokumen lengkap, Tagihan bayar-dulu dibayar, baru lalu Tugas Ambil surat pengantar, IPTM Terbit mengisi Makam TPU", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-platform");
    const nomor = await pesanPengurusanIptm(pemesan);
    simpan("iptm.nomor", nomor);
    await unggahBerkasPengajuan(pemesan, nomor);
    await langkah(pemesan, "Dokumen belum diperiksa: belum ada Tagihan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("link", { name: /Buka Tagihan/ })).toHaveCount(0);
    });
    await langkah(admin, "Sebelum Lunas: Tugas Ambil surat pengantar belum dibuat", async () => {
      await admin.goto(`/staf/admin-platform/pengurusan/${nomor}`);
      await expect.soft(admin.getByText(/Tugas ambil surat pengantar/)).toHaveCount(0);
    });
    await periksaDokumenLaluBayar(pemesan, admin, nomor);
    await langkah(admin, "Sudah Lunas: Tugas Ambil surat pengantar dibuat otomatis", async () => {
      await admin.goto(`/staf/admin-platform/pengurusan/${nomor}`);
      await expect(admin.getByText(/Sudah Lunas\. Tugas ambil surat pengantar sudah dibuat otomatis/)).toBeVisible();
    });
    await ajukanIptm(admin, nomor);
    // Valid for two more months: inside the three months before expiry that R3-48.1 renews from.
    await terbitkanIptm(admin, nomor, tanggalWib(60));
    await langkah(pemesan, "IPTM Terbit: halaman pesanan, lalu Makam TPU di Makam Keluarga", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("heading", { name: "IPTM terbit" })).toBeVisible();
      await pemesan.goto("/akun/makam");
      await expect(pemesan.getByRole("link", { name: /Perpanjang IPTM/ }).first()).toBeVisible();
    });
    await manual(pemesan, "Tagihan hanya Biaya Pengurusan pengajuan; IPTM terkirim ke Pemesan dan Pemegang Hak walau Tagihan belum lunas", "dibaca owner pada rincian Tagihan dan email");
  });

  test("R3-47.2 Penolakan PTSP: yang dapat diperbaiki diajukan ulang tanpa Tagihan baru, yang final ditolak dengan refund penuh", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-platform");
    const nomor = await pesanPengurusanIptm(pemesan);
    await unggahBerkasPengajuan(pemesan, nomor);
    await periksaDokumenLaluBayar(pemesan, admin, nomor);
    await ajukanIptm(admin, nomor);
    const tagihan = () => pemesan.getByRole("link", { name: /Buka Tagihan/ }).evaluateAll((tautan) => tautan.map((satu) => satu.getAttribute("href")));
    await pemesan.goto(`/pengurusan/${nomor}`);
    const sebelum = await tagihan();

    await catatPutusanPtsp(admin, nomor, "perbaikan", "Uji UAT: foto Surat Kuasa kurang jelas");
    await langkah(pemesan, "Perlu Perbaikan: alasan terbaca, unggah ulang tanpa biaya baru", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("alert").filter({ hasText: "Perbaikan diminta" })).toContainText("foto Surat Kuasa kurang jelas");
      await expect(pemesan.getByText(/tidak ada biaya baru/i)).toBeVisible();
    });
    await unggahBerkasPengajuan(pemesan, nomor);
    await ajukanIptm(admin, nomor);
    await langkah(pemesan, "Diajukan ulang: tidak ada Tagihan baru", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      expect.soft(await tagihan(), "tautan Tagihan sebelum dan sesudah diajukan ulang").toEqual(sebelum);
    });

    await catatPutusanPtsp(admin, nomor, "final", "Uji UAT: ditolak final oleh PTSP");
    await langkah(pemesan, "Ditolak: alasan terbaca dan seluruh pembayaran dikembalikan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("heading", { name: "Pengajuan ditolak PTSP" })).toBeVisible();
      await expect(pemesan.getByText(/Uji UAT: ditolak final oleh PTSP/)).toBeVisible();
      await expect(pemesan.getByText(/Seluruh pembayaran Anda, Biaya Pengurusan termasuk, dikembalikan/)).toBeVisible();
    });
    await kunjungi(admin, "Pengembalian dana: permintaan refund penuh untuk pesanan yang ditolak", "/staf/admin-platform/pengembalian", /Pengembalian/);
    await expect.soft(admin.getByText(nomor).first()).toBeVisible();
    await manual(admin, "Jumlah refund = seluruh pembayaran termasuk Biaya Pengurusan, ditanggung Operator", "dibaca owner dari rincian Tagihan dan baris Pengembalian (screenshot)");
    await manual(pemesan, "Tidak ada Tagihan baru setelah pengajuan ulang", "dibaca owner pada daftar Tagihan di Akun Saya");
  });

  test("R3-48.1 Perpanjangan TPU: koreksi tanggal berakhir, dokumen diperiksa, Tagihan bayar-dulu dibayar, IPTM Terbit memperbarui Makam TPU", async ({ sebagai }) => {
    wajib("iptm.nomor", "R3-47.1"); // the Makam TPU this renews is the one R3-47.1 left, its IPTM valid for two more months
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-platform");
    const nomor = await langkah(pemesan, "Makam Keluarga → Perpanjang IPTM: data, Pesan perpanjangan IPTM", async () => {
      await pemesan.goto("/akun/makam");
      await pemesan.getByRole("link", { name: /Perpanjang IPTM/ }).first().click();
      await pemesan.locator('input[name="pemesanName"]').fill("Uji UAT Pemesan");
      await pemesan.locator('input[name="phoneNumber"]').fill(DATA.telepon());
      await pemesan.getByRole("button", { name: "Pesan perpanjangan IPTM" }).click();
      await expect(pemesan).toHaveURL(/\/pengurusan\/MKM-\d{4}-\d{6}/, { timeout: 30_000 });
      return nomorPemesananDi(pemesan.url());
    });
    await unggahBerkasPengajuan(pemesan, nomor);
    await langkah(admin, `Admin Platform ${nomor}: koreksi tanggal berakhir IPTM dengan alasan`, async () => {
      await admin.goto(`/staf/admin-platform/pengurusan/${nomor}`);
      await admin.locator('input[name="berlakuSampai"]').first().fill(tanggalWib(61));
      await admin.locator('input[name="alasan"]').first().fill("Uji UAT: disamakan dengan foto IPTM");
      await admin.getByRole("button", { name: "Simpan koreksi" }).click();
      await expect(admin.getByRole("button", { name: "Simpan koreksi" })).toBeEnabled({ timeout: 30_000 });
    });
    await periksaDokumenLaluBayar(pemesan, admin, nomor);
    await langkah(pemesan, "Dibayar: Sudah dibayar menunggu pengajuan; lama terbit 5 hari kerja tampil", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByTestId("lama-terbit")).toContainText("5 hari kerja");
      await expect(pemesan.getByText("Sudah dibayar, menunggu pengajuan").first()).toBeVisible();
    });
    await ajukanIptm(admin, nomor);
    await terbitkanIptm(admin, nomor, tanggalWib(61 + 3 * 365));
    await langkah(pemesan, "IPTM Terbit: halaman Perpanjangan IPTM", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("heading", { name: "IPTM terbit" })).toBeVisible();
    });
    await manual(admin, "Koreksi tanggal berakhir tercatat di Entri Audit dengan alasannya; IPTM terkini dan riwayat Makam TPU diperbarui", "dibaca owner pada Audit Log dan kartu Makam TPU di Makam Keluarga (screenshot)");
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
