import { perpanjangDanBayar, pilihMasaLaluTagihan, bukaTagihanDanBayar } from "../support/alur";
import { bayarDenganQris } from "../support/bayar";
import { DATA, bukaBarisAntreanLokasi, jpegContoh, lokasiIdDariNama, nomorPemesananDi, persis, tanggalWib } from "../support/halaman";
import { baca, simpan, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { emailPersona } from "../support/persona";
import { expect, test } from "../support/uji";

/*
 * Rilis 2, the [BAYAR] items of .scratch/makam-v1-build/uat-rilis-2-3-checklist.md:
 * each pays through the sandbox, so each must run on staging before the switch.
 * The Hak Pakai they use are staging data (checklist, P8), named by environment
 * variables (uat/README.md); a journey without its data is skipped, and says so.
 */

const dariEnv = (nama: string) => process.env[nama]?.trim() || null;

test.describe("Rilis 2 [BAYAR]", { tag: ["@rilis2", "@bayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("R2-35.1 Tumpang di bawah Hak Pakai yang ada: Tagihan bayar-belakang dibayar, tanpa Bukti Pemesanan baru", async ({ sebagai }) => {
    const hakPakai = dariEnv("UAT_HAK_PAKAI_TUMPANG");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_TUMPANG: id Hak Pakai milik persona Pemesan yang mengizinkan tumpang (P8d)");
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Makamkan di sini: Almarhum dan Pemesan, Kirim permintaan", async () => {
      await pemesan.goto(`/pesan-makam/makamkan-di-sini/${hakPakai}`);
      await expect(pemesan.getByRole("heading", { name: "Data & kirim" })).toBeVisible();
      await pemesan.getByLabel("Nama almarhum / almarhumah").fill("Almarhum Tumpang Uji UAT");
      await pemesan.getByLabel("Tanggal wafat").fill(tanggalWib(-1));
      await pemesan.getByLabel("Nama lengkap", { exact: true }).fill("Uji UAT Pemesan");
      await pemesan.getByLabel("Nomor telepon", { exact: true }).fill(DATA.telepon());
      const email = pemesan.getByLabel("Email", { exact: true });
      if ((await email.isEditable()) && !(await email.inputValue())) await email.fill(emailPersona("pemesan"));
      await pemesan.getByRole("button", { name: "Kirim permintaan" }).click();
      await expect(pemesan).toHaveURL(/\/pesanan\/MKM-\d{4}-\d{6}$/, { timeout: 30_000 });
      simpan("tumpang.nomor", nomorPemesananDi(pemesan.url()));
    });
    const nomor = wajib("tumpang.nomor", "R2-35.1");
    const admin = await sebagai("admin-lokasi");
    const lokasiId = baca("saatduka.lokasiId") ?? (await lokasiIdDariNama(admin, DATA.lokasiSaatDuka()));
    await bukaBarisAntreanLokasi(admin, lokasiId, "Konfirmasi Saat Duka", nomor);
    await langkah(admin, "Persetujuan Pemegang Hak terlihat; Konfirmasi pemakaman (Tagihan bayar-belakang)", async () => {
      await expect.soft(admin.getByTestId("konsen-tumpang")).toBeVisible();
      await admin.getByLabel("Pemakaman", { exact: true }).fill(`${tanggalWib(1)}T10:00`);
      await admin.getByRole("button", { name: "Konfirmasi pemakaman" }).click();
      await expect(admin.getByRole("button", { name: "Konfirmasi pemakaman" })).toHaveCount(0, { timeout: 30_000 });
    });
    await langkah(admin, "Catat Pemakaman (lapis 2): masuk ke Hak Pakai, jam Tagihan 3×24 jam mulai", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
      await admin.getByLabel("Tanggal pemakaman").fill(tanggalWib(0));
      await admin.getByLabel("Lapis").fill("2");
      await admin.getByRole("button", { name: "Catat pemakaman" }).click();
    });
    await langkah(pemesan, "Pemesan: buka dan bayar Tagihan bayar-belakang tumpang", async () => {
      await pemesan.goto(`/pesanan/${nomor}`);
      await pemesan.getByRole("link", { name: /TGH\/\d{4}\/\d{6}/ }).first().click();
    });
    await expect(pemesan).toHaveURL(/\/dokumen\//);
    await bayarDenganQris(pemesan, new URL(pemesan.url()).pathname);
    await langkah(pemesan, "Tumpang tidak menerbitkan Bukti Pemesanan baru", async () => {
      await pemesan.goto(`/pesanan/${nomor}`);
      await expect(pemesan.getByTestId("bukti-pemesanan")).toHaveCount(0);
    });
  });

  test("R2-41.1 Perpanjangan jalur KTP: berkas, Periksa dokumen, Setujui, pilih masa, bayar, Bukti Perpanjangan", async ({ sebagai }) => {
    const hakPakai = dariEnv("UAT_HAK_PAKAI_TANPA_EMAIL");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_TANPA_EMAIL: id Hak Pakai tanpa email tercatat (P8c)");
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Perpanjang lewat berkas: jalur KTP, unggah, Ajukan permohonan", async () => {
      await pemesan.goto(`/perpanjangan/${hakPakai}/berkas`);
      await pemesan.getByRole("navigation", { name: "Jalur permohonan" }).getByRole("link", { name: /KTP/i }).first().click().catch(() => undefined);
      await pemesan.getByLabel("Nama lengkap Anda").fill("Uji UAT Pemesan");
      await pemesan.locator('input[name="nomorTelepon"]').fill(DATA.telepon());
      for (const kolom of await pemesan.locator('input[type="file"]').all()) await kolom.setInputFiles(jpegContoh());
      await pemesan.getByRole("button", { name: "Ajukan permohonan" }).click();
      await expect(pemesan).toHaveURL(/\/perpanjangan\/permohonan\/[0-9a-f-]{36}/, { timeout: 30_000 });
      simpan("perpanjangan.permohonan", new URL(pemesan.url()).pathname);
    });
    const admin = await sebagai("admin-lokasi");
    const lokasiId = baca("saatduka.lokasiId") ?? (await lokasiIdDariNama(admin, DATA.lokasiSaatDuka()));
    await langkah(admin, "Admin Lokasi: baris Periksa dokumen Perpanjangan, Setujui permohonan", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/antrean`);
      await expect(admin.getByText("Periksa dokumen Perpanjangan", { exact: true }).first()).toBeVisible();
      await admin.locator('a[href*="/perpanjangan/"]').first().click();
      const berakhir = admin.locator('input[name="endDate"]');
      if (await berakhir.count()) await berakhir.fill(tanggalWib(30));
      await admin.getByTestId("setujui-permohonan").click();
      await expect(admin.getByTestId("setujui-permohonan")).toHaveCount(0, { timeout: 30_000 });
    });
    await langkah(pemesan, "Pemohon: pilih masa, Lanjut ke Tagihan", async () => {
      await pemesan.goto(wajib("perpanjangan.permohonan", "R2-41.1"));
      await pilihMasaLaluTagihan(pemesan);
    });
    await bukaTagihanDanBayar(pemesan);
    await manual(pemesan, "Email dan telepon tercatat diperbarui (audit) dan tanggal akhir bertambah", "dibaca owner pada Hak Pakai dan Audit Log Lokasi");
  });

  test("R2-42.1 Perpanjangan di masa tenggang: dibayar, baris masa tenggang tertutup", async ({ sebagai }) => {
    const hakPakai = dariEnv("UAT_HAK_PAKAI_MASA_TENGGANG");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_MASA_TENGGANG: id Hak Pakai Kedaluwarsa dalam masa tenggang milik persona Pemesan (P8b)");
    const admin = await sebagai("admin-lokasi");
    const lokasiId = baca("saatduka.lokasiId") ?? (await lokasiIdDariNama(admin, DATA.lokasiSaatDuka()));
    await langkah(admin, "Antrean Lokasi: baris Hak Pakai dalam masa tenggang", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/antrean`);
      await expect(admin.getByText("Hak Pakai dalam masa tenggang", { exact: true }).first()).toBeVisible();
    });
    await perpanjangDanBayar(await sebagai("pemesan"), `/perpanjangan/${hakPakai}`);
    await langkah(admin, "Baris masa tenggang tertutup sesudah Perpanjangan dibayar", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/antrean`);
      await expect.soft(admin.getByText("Hak Pakai dalam masa tenggang", { exact: true })).toHaveCount(0);
    });
  });

  test("R2-59.1 Lokasi Ditangguhkan: halaman tetap tayang, Hak Pakai baru diblokir, Perpanjangan tetap bisa dibayar", async ({ sebagai, anonim }) => {
    const lokasi = DATA.lokasiBerhenti();
    const hakPakai = dariEnv("UAT_HAK_PAKAI_BERHENTI");
    test.skip(!lokasi || !hakPakai, "Isi UAT_LOKASI_BERHENTI dan UAT_HAK_PAKAI_BERHENTI (P9)");
    const admin = await sebagai("admin-platform");
    const publik = await anonim();
    const lokasiId = await lokasiIdDariNama(publik, lokasi!);
    await langkah(admin, "Admin Platform: Status kemitraan → Tangguhkan dengan alasan", async () => {
      await admin.goto(`/staf/admin-platform/lokasi/${lokasiId}`);
      const form = admin.locator("form").filter({ has: admin.getByRole("button", { name: /^Tangguhkan/ }) });
      await form.getByLabel(/Alasan/i).fill("Uji UAT: Lokasi ditangguhkan");
      await form.getByRole("button", { name: /^Tangguhkan/ }).click();
      await expect(admin.getByText(/Ditangguhkan/).first()).toBeVisible({ timeout: 30_000 });
    });
    await langkah(publik, "Halaman Lokasi tetap tayang dengan 'sementara tidak menerima pesanan'; hilang dari daftar Terencana", async () => {
      await publik.goto(`/lokasi/${lokasiId}`);
      await expect(publik.getByText(/sementara tidak menerima pesanan/i).first()).toBeVisible();
      await publik.goto("/pesan-makam/terencana");
      await expect(publik.getByRole("link", { name: persis(lokasi!) })).toHaveCount(0);
    });
    await perpanjangDanBayar(await sebagai("pemesan"), `/perpanjangan/${hakPakai}`);
  });

  test("R2-59.2 Lokasi Berhenti: Layanan terbayar yang belum selesai dibatalkan dan direfund penuh", async ({ sebagai }) => {
    const lokasi = DATA.lokasiBerhenti();
    const layanan = dariEnv("UAT_LAYANAN_BERHENTI");
    test.skip(!lokasi || !layanan, "Isi UAT_LOKASI_BERHENTI dan UAT_LAYANAN_BERHENTI: nomor Layanan terbayar belum selesai di Lokasi itu (P9). Berhenti tidak bisa dibatalkan");
    test.setTimeout(45 * 60_000);
    const admin = await sebagai("admin-platform");
    const lokasiId = await lokasiIdDariNama(await (await sebagai("pemesan")).context().newPage(), lokasi!);
    await langkah(admin, "Admin Platform: Hentikan Lokasi dengan tanggal efektif besok", async () => {
      await admin.goto(`/staf/admin-platform/lokasi/${lokasiId}`);
      const form = admin.locator("form").filter({ has: admin.getByRole("button", { name: /^Hentikan/ }) });
      await form.getByLabel(/Alasan/i).fill("Uji UAT: Lokasi berhenti");
      const tanggal = form.getByLabel(/Tanggal/i);
      if (await tanggal.count()) await tanggal.fill(tanggalWib(0));
      await form.getByRole("button", { name: /^Hentikan/ }).click();
      await expect(admin.getByText(/Berhenti/).first()).toBeVisible({ timeout: 30_000 });
    });
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Setelah tanggal efektif: Layanan dibatalkan dengan refund penuh (tick 15 menit)", async () => {
      await expect(async () => {
        await pemesan.goto(`/layanan/${layanan}`);
        await expect(pemesan.getByText(/Dibatalkan/).first()).toBeVisible({ timeout: 2_000 });
      }).toPass({ timeout: 30 * 60_000, intervals: [30_000] });
    });
    await manual(pemesan, "Refund penuh termasuk Biaya Layanan Platform dan Makam tab hanya-baca dengan kontak pengelola", "dibaca owner pada Tagihan dan kartu Makam Saya (screenshot)");
  });
});
