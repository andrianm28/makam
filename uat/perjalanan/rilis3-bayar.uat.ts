import { bukaTagihanDanBayar, konfirmasiTpuSaatDuka, pesanTpuSaatDuka } from "../support/alur";
import { angkaDiHalaman } from "../support/bayar";
import { DATA, kunjungi, nomorPemesananDi, tanggalWib } from "../support/halaman";
import { TUNGGU_TICK_MS, ajukanIptm, catatPutusanPtsp, pesanPengurusanIptm, periksaDokumen, periksaDokumenLaluBayar, tagihanPesanan, terbitkanIptm, tungguDiproses, unggahBerkasPengajuan } from "../support/iptm";
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

  test("R3-46.1 dan R3-53.1 Pesanan TPU terbayar dibatalkan sebelum IPTM Diajukan: Dibatalkan, Layanan hari-H dibatalkan dan permintaan refund sebesar seluruh pembayaran", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const nomor = await pesanTpuSaatDuka(pemesan, { layananHariH: true });
    await konfirmasiTpuSaatDuka(await sebagai("admin-platform"), nomor);
    let total = "";
    await langkah(pemesan, "Pesanan kedua dikonfirmasi: Layanan hari-H di pesanan, total Tagihan dicatat", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("heading", { name: "Layanan hari-H" })).toBeVisible({ timeout: 30_000 });
      const teks = await pemesan.getByTestId("tagihan-konfirmasi").innerText();
      total = angkaDiHalaman(teks.split("sebesar")[1] ?? "")[0] ?? "";
      expect(total, "total Tagihan terbaca dari halaman pesanan").not.toBe("");
    });
    await bukaTagihanDanBayar(pemesan);
    await langkah(pemesan, "Batalkan pengurusan sebelum IPTM Diajukan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await pemesan.getByRole("button", { name: "Batalkan pengurusan" }).click();
      // Exact: the cancel section's own text ("Bisa dibatalkan sampai IPTM diajukan...") holds the word too, and is there before the cancel.
      await expect(pemesan.getByText("Dibatalkan", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    });
    // The order page no longer lists the hari-H jobs once it is Dibatalkan; the same jobs are on the Layanan page of the same Nomor Pemesanan.
    await langkah(pemesan, "R3-53.1: setiap Layanan hari-H pesanan itu Dibatalkan (tak ada yang Sedang Dikerjakan)", async () => {
      await pemesan.goto(`/layanan/${nomor}`);
      const pekerjaan = pemesan.locator("li").filter({ has: pemesan.locator("h3") });
      await expect(pekerjaan.first()).toBeVisible({ timeout: 30_000 });
      const jumlah = await pekerjaan.count();
      await expect(pekerjaan.filter({ hasText: "Dibatalkan" }), "setiap pekerjaan Layanan hari-H berstatus Dibatalkan").toHaveCount(jumlah);
    });
    await langkah(pemesan, "R3-46.1: permintaan refund menunggu rekening, sebesar seluruh pembayaran (belum Dimakamkan)", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      const teks = await pemesan.getByText(/Dana sebesar/).first().innerText();
      expect.soft(angkaDiHalaman(teks)[0], "jumlah pengembalian sama dengan total Tagihan yang dibayar").toBe(total);
    });
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Pengembalian dana: permintaan refund pesanan yang dibatalkan", "/staf/admin-platform/pengembalian", /Pengembalian/);
    await expect.soft(admin.getByText(nomor).first()).toBeVisible();
    await manual(admin, "Rincian refund: Biaya Pengurusan ikut dikembalikan sebelum Dimakamkan, Layanan hari-H dikembalikan kecuali yang Sedang Dikerjakan", "dibaca owner pada baris Pengembalian dan rincian Tagihan (screenshot); jumlah totalnya sudah dicek runner");
  });

  test("R3-47.1 Pengurusan IPTM (hanya pengajuan): dokumen lengkap, Tagihan bayar-dulu dibayar, baru lalu Tugas Ambil surat pengantar, IPTM Terbit mengisi Makam TPU", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-platform");
    const nomor = await pesanPengurusanIptm(pemesan);
    simpan("iptm.nomor", nomor);
    await unggahBerkasPengajuan(pemesan, nomor);
    await langkah(pemesan, "Dokumen belum diperiksa: belum ada Tagihan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      // The order page must really be there: on an error page "no Buka Tagihan link" holds for the wrong reason.
      await expect(pemesan.getByTestId("nomor-pemesanan")).toHaveText(nomor);
      await expect(pemesan.getByRole("link", { name: /Buka Tagihan/ })).toHaveCount(0);
    });
    await periksaDokumen(pemesan, admin, nomor);
    await langkah(admin, "Tagihan terbit, belum dibayar: Tugas Ambil surat pengantar belum dibuat", async () => {
      await admin.goto(`/staf/admin-platform/pengurusan/${nomor}`);
      await expect(admin.getByText(/Tugas ambil surat pengantar dibuat otomatis setelah Lunas/)).toBeVisible();
    });
    await bukaTagihanDanBayar(pemesan);
    // Only now, after the minute tick that sees the Lunas, is the Tugas made.
    await tungguDiproses(admin, nomor);
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
    // The family's page shows the Tagihan only while the order is Menunggu Pembayaran (ticket 116), so at IPTM Diajukan it holds no link
    // to compare. The Tagihan is read on Admin Platform's Tagihan search, which lists every Tagihan issued for this Nomor Pemesanan.
    const sebelum = await langkah(admin, "IPTM Diajukan: pesanan ini punya satu Tagihan (bayar-dulu)", async () => {
      const daftar = await tagihanPesanan(admin, nomor);
      expect(daftar, "pesanan Pengurusan IPTM punya tepat satu Tagihan (bayar-dulu) sebelum penolakan PTSP").toHaveLength(1);
      return daftar;
    });

    await catatPutusanPtsp(admin, nomor, "perbaikan", "Uji UAT: foto Surat Kuasa kurang jelas");
    await langkah(pemesan, "Perlu Perbaikan: alasan terbaca, unggah ulang tanpa biaya baru", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("alert").filter({ hasText: "Perbaikan diminta" })).toContainText("foto Surat Kuasa kurang jelas");
      await expect(pemesan.getByText(/tidak ada biaya baru/i)).toBeVisible();
    });
    await unggahBerkasPengajuan(pemesan, nomor);
    await ajukanIptm(admin, nomor);
    await langkah(admin, "Diajukan ulang: tidak ada Tagihan baru, daftar Tagihan pesanan tetap sama", async () => {
      expect.soft(await tagihanPesanan(admin, nomor), "Tagihan pesanan ini sebelum dan sesudah diajukan ulang").toEqual(sebelum);
    });

    await catatPutusanPtsp(admin, nomor, "final", "Uji UAT: ditolak final oleh PTSP");
    await langkah(pemesan, "Ditolak: alasan terbaca dan seluruh pembayaran dikembalikan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("heading", { name: "Pengajuan ditolak PTSP" })).toBeVisible();
      // Twice on the page (the "Pengajuan ditolak PTSP" section and the "Alasan" row of "Yang dipesan"): `.first()` for strict mode.
      await expect(pemesan.getByText(/Uji UAT: ditolak final oleh PTSP/).first()).toBeVisible();
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
      await expect(admin.getByText("Tanggal berakhir IPTM dikoreksi.")).toBeVisible({ timeout: 30_000 });
    });
    await periksaDokumenLaluBayar(pemesan, admin, nomor);
    await langkah(pemesan, "Dibayar: Sudah dibayar menunggu pengajuan (tick per menit); lama terbit 5 hari kerja tampil", async () => {
      await expect(async () => {
        await pemesan.goto(`/pengurusan/${nomor}`);
        await expect(pemesan.getByText("Sudah dibayar, menunggu pengajuan").first()).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: TUNGGU_TICK_MS, intervals: [5_000] });
      await expect(pemesan.getByTestId("lama-terbit")).toContainText("5 hari kerja");
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
      // The Nomor Pemesanan, not any word: the form's own address /layanan/tpu would match at once and "tpu" would be saved.
      await expect(pemesan).toHaveURL(/\/layanan\/MKM-\d{4}-\d{6}$/, { timeout: 30_000 });
      simpan("tpu.layanan.nomor", new URL(pemesan.url()).pathname.split("/").pop()!);
    });
    await bukaTagihanDanBayar(pemesan);
    await langkah(pemesan, "Halaman Layanan: Sudah dibayar, Pekerjaan Dijadwalkan", async () => {
      await pemesan.goto(`/layanan/${wajib("tpu.layanan.nomor", "R3-56.1")}`);
      await expect(pemesan.getByText(/Sudah dibayar|Dijadwalkan/).first()).toBeVisible();
    });
  });
});
