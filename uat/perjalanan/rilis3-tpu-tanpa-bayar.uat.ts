import { bukaDataTpu, konfirmasiTpuSaatDuka, pesanTpuSaatDuka } from "../support/alur";
import { kunjungi, persis, tanggalWib } from "../support/halaman";
import { ajukanIptm, pesanPengurusanIptm, periksaDokumen, terbitkanIptm, unggahBerkasPengajuan } from "../support/iptm";
import { simpan, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Rilis 3, the [TANPA-BAYAR] items for the TPU DKI side (tickets 43 to 48): none pays, so they may run after the
 * switch. The Saat Duka TPU order is pay-after: Admin Platform confirms it and the burial, the documents and the IPTM
 * all go on without any payment, which is how R3-45.2 to R3-46.3 follow one order from its confirmation to IPTM Terbit.
 * Needs the TPU data of the checklist's P3 to P5. What only a mailbox, a phone or the passing of days can show is a
 * `manual` step.
 */

test.describe("Rilis 3 TPU [TANPA-BAYAR]", { tag: ["@rilis3", "@tanpabayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("R3-43.1 Admin Platform mengelola TPU DKI: flag menerima makam baru mencatat tanggal, baris Cek status TPU muncul 14 hari sesudah pembaruan terakhir", async ({ sebagai }) => {
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Admin Platform: daftar TPU DKI dengan Tambah TPU", "/staf/admin-platform/tpu");
    await langkah(admin, "Buka satu TPU: Profil TPU dan Status makam baru", async () => {
      await admin.locator('a[href^="/staf/admin-platform/tpu/"]').first().click();
      await expect(admin.getByText("Profil TPU").first()).toBeVisible();
      await expect(admin.getByText("Status makam baru").first()).toBeVisible();
    });
    await manual(admin, "Menambah atau mengubah TPU (nama, alamat, pin, sumber data, flag); flag menerima makam baru mencatat tanggalnya dan diaudit", "dikerjakan owner pada TPU uji; tanggal dibaca di halaman TPU dan Audit Log");
    await manual(admin, "Baris Tier 4 'Cek status TPU' muncul 14 hari setelah pembaruan terakhir dan menutup saat diperbarui", "butuh waktu; dibaca owner di Antrean Admin Platform pada TPU yang tidak diperbarui 14 hari");
  });

  test("R3-43.2 Halaman TPU: TPU resmi Pemerintah Provinsi DKI Jakarta tanpa kata Terverifikasi, Retribusi IPTM Rp 0 sebagai baris tersendiri dan dua Biaya Pengurusan", async ({ anonim }) => {
    const publik = await anonim();
    await langkah(publik, "Daftar Lokasi: kartu TPU, buka halaman TPU", async () => {
      await publik.goto("/lokasi");
      await publik.locator('a[href^="/tpu/"]').first().click();
      await expect(publik.getByRole("heading", { name: "Harga" })).toBeVisible();
    });
    await langkah(publik, "Halaman TPU: label resmi, kotak harga dengan Retribusi Rp 0 dan dua Biaya Pengurusan", async () => {
      await expect(publik.getByText("TPU resmi Pemerintah Provinsi DKI Jakarta").first()).toBeVisible();
      await expect(publik.getByText(/diperbarui/).first()).toBeVisible();
      await expect(publik.getByText("Terverifikasi")).toHaveCount(0);
      await expect(publik.getByText("Retribusi Pemda (IPTM)").first()).toBeVisible();
      await expect(publik.locator("li, div, tr").filter({ hasText: "Retribusi Pemda (IPTM)" }).filter({ hasText: /Rp\s*0(?![\d.])/ }).first(), "Retribusi IPTM Rp 0 sebagai baris tersendiri").toBeVisible();
      await expect(publik.getByText("Biaya Pengurusan (hanya berkas)").first()).toBeVisible();
      await expect(publik.getByText("Biaya Pengurusan (mengatur pemakaman)").first()).toBeVisible();
    });
    await manual(publik, "Kartu TPU di Daftar Lokasi dengan filter jenis; 'mulai Rp X' = Biaya Pengurusan pemakaman + Retribusi; bendera makam baru dengan 'diperbarui <tanggal>'", "dibaca owner pada screenshot /lokasi dan halaman TPU");
  });

  test("R3-43.3 Halaman Pengurusan di TPU DKI: panduan DIY gratis, dua Biaya Pengurusan, daftar harga Layanan DKI dan tautan ke Saat Duka TPU, Perpanjang IPTM dan Kami urus IPTM-nya", async ({ anonim }) => {
    const publik = await anonim();
    await kunjungi(publik, "Pengurusan di TPU DKI", "/pengurusan-tpu", "Pengurusan di TPU DKI");
    await langkah(publik, "Bagian panduan gratis, jasa kami, daftar harga Layanan, dan tautan ke tiga jalan masuk", async () => {
      await expect(publik.getByRole("heading", { name: "Mengurus sendiri, gratis" })).toBeVisible();
      await expect(publik.getByRole("heading", { name: "Kalau kami yang menguruskan" })).toBeVisible();
      await expect(publik.getByRole("heading", { name: "Harga Layanan di TPU DKI" })).toBeVisible();
      await expect(publik.locator('a[href*="/pesan-makam/saat-duka"]').first()).toBeVisible();
      await expect(publik.locator('a[href*="/pesan-makam/pengurusan-iptm"]').first()).toBeVisible();
      await expect(publik.getByRole("link", { name: /Perpanjang IPTM/ }).first()).toBeVisible();
    });
  });

  test("R3-44.1 Bagian TPU di Pilih makam hanya memuat TPU yang menerima makam baru; chip Semua, Lokasi Mitra dan TPU DKI menyaring", async ({ anonim }) => {
    const publik = await anonim();
    await langkah(publik, "Pilih makam: bagian TPU dan chip penyaring", async () => {
      await publik.goto("/pesan-makam/saat-duka");
      await expect(publik.getByRole("heading", { name: "Pilih makam" })).toBeVisible();
      await expect(publik.locator('a[href*="/pesan-makam/saat-duka/tpu"]').first(), "ada TPU yang menerima makam baru (checklist P5)").toBeVisible();
      for (const chip of ["Semua", "Lokasi Mitra", "TPU DKI"]) await expect.soft(publik.getByText(chip, { exact: true }).first(), `chip ${chip}`).toBeVisible();
    });
    await manual(publik, "Setiap TPU yang tampil menerima makam baru, dan TPU yang tidak menerima tidak tampil; chip menyaring daftar", "dibandingkan owner dengan flag di Admin Platform → TPU; klik tiap chip pada screenshot");
  });

  test("R3-44.2 Pengajuan TPU: kelayakan KTP DKI dan meninggal di Jakarta, Tumpang meminta foto IPTM, dua daftar dokumen", async ({ anonim }) => {
    const page = await anonim();
    await langkah(page, "Wizard TPU: tidak KTP DKI dan tidak meninggal di Jakarta memblokir dan mengarahkan ke Lokasi Mitra", async () => {
      await bukaDataTpu(page);
      await page.getByLabel("Tidak, KTP saya bukan DKI").check();
      await page.getByLabel("Tidak, meninggal di luar Jakarta").check();
      await expect(page.getByRole("alert").filter({ hasText: "hanya untuk warga dengan KTP DKI" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Lihat pilihan Lokasi Mitra" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Kirim pengurusan" }).first()).toBeDisabled();
    });
    await langkah(page, "Meninggal di luar Jakarta saja tidak memblokir, tetapi menambah tiga dokumen", async () => {
      await page.getByLabel("Ya, KTP saya DKI Jakarta").check();
      await expect(page.getByRole("alert").filter({ hasText: "hanya untuk warga dengan KTP DKI" })).toHaveCount(0);
      await expect(page.getByText(/Karena almarhum meninggal di luar Jakarta/)).toBeVisible();
    });
    await langkah(page, "Tumpang: deskripsi makam dan foto IPTM; dua daftar dokumen", async () => {
      await page.getByLabel("Tumpang", { exact: true }).check();
      await expect(page.getByLabel("Blok dan nomor makam")).toBeVisible();
      await expect(page.getByLabel("Foto IPTM makam yang ditumpang")).toBeVisible();
      await expect(page.getByText("Dibawa saat pemakaman").first()).toBeVisible();
      await expect(page.getByText(/Diupload setelah pemakaman, paling lambat 7 hari/).first()).toBeVisible();
    });
    await manual(page, "Tumpang: peringatan IPTM 3 tahun dan persetujuan wajib dicentang sebelum Kirim", "dibaca owner pada screenshot langkah Tumpang");
  });

  test("R3-44.3 Pengajuan malam hari: batas konfirmasi 2 jam layanan, nomor CS dan jam balasnya; baris harga Biaya Pengurusan dan Retribusi Rp 0 tanpa Biaya Layanan Platform", async ({ anonim }) => {
    const page = await anonim();
    await langkah(page, "Wizard TPU: rincian harga tanpa Biaya Layanan Platform", async () => {
      await bukaDataTpu(page);
      await expect(page.getByTestId("total-semua-biaya")).toBeVisible();
      await expect(page.getByText("Biaya Pengurusan").first()).toBeVisible();
      await expect(page.getByText(/Retribusi/).first()).toBeVisible();
      await expect(page.getByText("Biaya Layanan Platform")).toHaveCount(0);
    });
    await manual(page, "Pengajuan malam (di luar 06:00–18:00): batas konfirmasi 2 jam layanan ('paling lambat pukul 08:00' untuk 23:00) dan nomor CS dengan jam balasnya", "dikirim owner pada malam hari; halaman pesanan menampilkan 'Pengajuan ini masuk di luar jam layanan TPU' dan batas konfirmasi");
  });

  test("R3-45.2 Tugas Lapangan Ambil surat pengantar dibuat otomatis sekali saat Admin Platform mengonfirmasi", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-platform");
    const nomor = await pesanTpuSaatDuka(pemesan);
    simpan("tpu.saatduka.nomor", nomor);
    await konfirmasiTpuSaatDuka(admin, nomor);
    await langkah(admin, "Tugas Lapangan: Ambil surat pengantar ada setelah konfirmasi", async () => {
      await admin.goto("/staf/admin-platform/tugas-lapangan");
      await expect(admin.getByRole("heading", { name: "Setiap Tugas Lapangan" })).toBeVisible();
      await expect(admin.getByText("Ambil surat pengantar").first()).toBeVisible();
    });
    await manual(admin, "Tugas dibuat hanya sekali per pesanan; baris Tier 2 saat belum ditugaskan atau terlambat; tawaran TPU lain (keluarga menerima atau menolak); eskalasi 30 dan 90 menit, baris malam 06:00", "dibaca owner di Antrean Admin Platform dan halaman pesanan; eskalasi butuh waktu");
  });

  test("R3-45.3 Halaman konfirmasi: waktu pemakaman, alamat TPU, kontak Admin Platform dan petugas TPU, daftar dokumen, baris harga", async ({ sebagai }) => {
    const nomor = wajib("tpu.saatduka.nomor", "R3-45.2");
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Halaman pengurusan setelah konfirmasi: yang dibaca keluarga", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByText("Waktu pemakaman")).toBeVisible();
      await expect(pemesan.getByText("Alamat TPU")).toBeVisible();
      await expect(pemesan.getByText("Kontak TPU")).toBeVisible();
      await expect(pemesan.getByText("Petugas TPU Uji, 081234500002")).toBeVisible();
      await expect(pemesan.getByRole("heading", { name: "Dokumen" })).toBeVisible();
      await expect(pemesan.getByTestId("tagihan-konfirmasi")).toContainText("Tagihan");
    });
    await manual(pemesan, "Kontak dan nama Admin Platform yang menangani terlihat; Operator menanggung kerugian bila Tagihan tak dibayar (dikejar tanpa Pencairan)", "dibaca owner pada screenshot dan pada Tagihan Lewat Jatuh Tempo di Admin Platform");
  });

  test("R3-46.2 Status dari Diajukan sampai Dokumen Lengkap terlihat di linimasa; dokumen jatuh tempo 7 hari; Surat Kuasa atas nama PT JKP", async ({ sebagai }) => {
    const nomor = wajib("tpu.saatduka.nomor", "R3-45.2");
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-platform");
    await langkah(admin, "Admin Platform: Pemakaman sudah berlangsung (status Dimakamkan)", async () => {
      await admin.goto(`/staf/admin-platform/pengurusan/${nomor}`);
      await admin.getByRole("button", { name: "Pemakaman sudah berlangsung" }).click();
      await expect(admin.getByRole("button", { name: "Pemakaman sudah berlangsung" })).toHaveCount(0, { timeout: 30_000 });
    });
    await langkah(pemesan, "Pemesan: linimasa memuat Dimakamkan, dokumen jatuh tempo 7 hari, Surat Kuasa PT Jaya Korpora Prima", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByTestId("linimasa").getByText("Dimakamkan")).toBeVisible();
      await expect(pemesan.getByText(/Unggah paling lambat/)).toBeVisible();
      await pemesan.getByRole("link", { name: "buka dan cetak" }).click();
      await expect(pemesan.getByText(/Jaya Korpora Prima/).first()).toBeVisible();
    });
    await unggahBerkasPengajuan(pemesan, nomor);
    await langkah(admin, "Admin Platform: Dokumen lengkap, linimasa memuat Dokumen Lengkap", async () => {
      await admin.goto(`/staf/admin-platform/pengurusan/${nomor}`);
      await admin.getByRole("button", { name: "Dokumen lengkap" }).click();
      await expect(admin.getByRole("button", { name: "Dokumen lengkap" })).toHaveCount(0, { timeout: 30_000 });
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByTestId("linimasa").getByText("Dokumen Lengkap")).toBeVisible();
    });
    await manual(pemesan, "Surat Kuasa memuat nama PT Jaya Korpora Prima yang benar dan nama staf yang mengajukan; dokumen yang lewat 7 hari muncul di Perlu tindakan", "nama PT JKP dicek owner pada screenshot Surat Kuasa; Perlu tindakan butuh 7 hari");
  });

  test("R3-46.3 IPTM Terbit: scan dikirim walau Tagihan belum lunas, Makam TPU terisi, tidak ada Bukti Pemesanan di TPU", async ({ sebagai }) => {
    const nomor = wajib("tpu.saatduka.nomor", "R3-45.2");
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-platform");
    await ajukanIptm(admin, nomor);
    await terbitkanIptm(admin, nomor, tanggalWib(3 * 365));
    await langkah(pemesan, "Pemesan: IPTM terbit walau Tagihan belum dibayar, tanpa Bukti Pemesanan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("heading", { name: "IPTM terbit" })).toBeVisible();
      await expect(pemesan.getByText("IPTM tetap dikirim walaupun Tagihan belum dibayar.")).toBeVisible();
      await expect(pemesan.getByText("Bukti Pemesanan")).toHaveCount(0);
    });
    await langkah(pemesan, "Makam Keluarga: kartu Makam TPU dengan blok dan nomor dari IPTM", async () => {
      await pemesan.goto("/akun/makam");
      await expect(pemesan.getByTestId("kartu-makam-tpu").filter({ hasText: "Blok UAT-1 No. 7" }).first()).toBeVisible();
    });
    await manual(admin, "Baris Tier 3 'IPTM filing' (7 hari) dan Tugas Berkas IPTM; tumpang memperbarui rekaman Makam TPU yang ada; IPTM terkirim ke Pemesan dan Pemegang Hak", "dibaca owner di Antrean dan Tugas Lapangan, dan di mailbox Pemesan");
  });

  test("R3-47.3 Pengurusan IPTM: tidak ada Tagihan sebelum dokumen lolos; baris Tier 3 pemeriksaan dokumen; Tagihan yang tak dibayar lapse 3×24 jam", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-platform");
    const nomor = await pesanPengurusanIptm(pemesan);
    await langkah(pemesan, "Sebelum dokumen lolos: tidak ada Tagihan", async () => {
      await pemesan.goto(`/pengurusan/${nomor}`);
      await expect(pemesan.getByRole("link", { name: /Buka Tagihan/ })).toHaveCount(0);
    });
    await unggahBerkasPengajuan(pemesan, nomor);
    await langkah(admin, "Antrean Admin Platform: baris pemeriksaan dokumen untuk pesanan ini", async () => {
      const baris = admin.getByRole("link", { name: persis(nomor) }).first();
      await expect(async () => {
        await admin.goto("/staf/admin-platform/antrean");
        await expect(baris).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 90_000, intervals: [3_000] });
    });
    await periksaDokumen(pemesan, admin, nomor);
    await manual(admin, "Pesanan ini sengaja tidak dibayar: Tagihan lapse 3×24 jam menjadi Dibatalkan (Menunggu Pembayaran); baris Tier 3 pengajuan (3 hari kerja) muncul setelah Lunas", "butuh 3×24 jam; dibaca owner pada halaman pesanan minggu uji berikutnya");
  });

  test("R3-48.2 Perpanjangan TPU: permintaan hanya dari 3 bulan sebelum IPTM berakhir; pengingat 3 bulan dan 1 bulan; lewat masa tenggang perlu Cek TPU", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Makam Keluarga → Perpanjang IPTM: aturan 3 bulan dan lama terbit tampil", async () => {
      await pemesan.goto("/akun/makam");
      const tautan = pemesan.getByRole("link", { name: /Perpanjang IPTM/ }).first();
      test.skip((await tautan.count()) === 0, "Tidak ada Makam TPU di akun Pemesan: jalankan R3-47.1 (atau R3-46.3) lebih dulu");
      await tautan.click();
      await expect(pemesan.getByText(/mulai 3 bulan sebelum IPTM berakhir/)).toBeVisible();
      await expect(pemesan.getByText("IPTM baru biasanya terbit dalam 5 hari kerja setelah pembayaran.")).toBeVisible();
    });
    await manual(pemesan, "Pengingat 3 bulan dan 1 bulan sebelum IPTM berakhir (08:00–20:00, berhenti saat dipesan; tanpa email, baris Telepon Pemesan tidak dobel)", "butuh waktu dan mailbox; dibaca owner");
    await manual(pemesan, "Lewat masa tenggang: baris 'Cek TPU (lewat masa tenggang)', TPU tidak memperpanjang → Ditolak tanpa biaya; Perlu Perbaikan sebelum bayar; Perpanjangan TPU tidak menyimpan data pemakaman", "dicoba owner dengan Makam TPU yang IPTM-nya dikoreksi Admin Platform ke tanggal lampau (R3-48.1)");
  });
});
