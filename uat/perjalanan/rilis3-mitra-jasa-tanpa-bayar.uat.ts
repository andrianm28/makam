import type { Page } from "@playwright/test";
import { DATA, ambilSemuaBuktiKamera, jpegContoh, kunjungi, pilihOpsi } from "../support/halaman";
import { baca } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { punyaPersona } from "../support/persona";
import { expect, test } from "../support/uji";

/*
 * Rilis 3, the [TANPA-BAYAR] items for Mitra Jasa and the TPU Layanan (tickets 55 to 57, and the TPU parts of 51 and 52).
 * None pays, so they may run after the switch; the job they follow is the Layanan TPU order R3-56.1 left behind
 * (`tpu.layanan.nomor`, so run it first with the same UAT_OUT), and the Mitra Jasa persona is the owner's alias
 * (UAT_EMAIL_MITRA_JASA). What only a mailbox, a phone or the passing of days can show is a `manual` step.
 */

const SYARAT_PEKERJAAN = "Jalankan R3-56.1 lebih dulu dengan UAT_OUT yang sama: pesanan Layanan TPU itu yang diikuti uji ini";
const SYARAT_MITRA = "Isi UAT_EMAIL_MITRA_JASA: alias Gmail Mitra Jasa yang sudah di-onboarding (checklist P2, P6)";

/** Admin Platform's page of the TPU job of `nomor` (from the job list); returns the job's id. */
async function bukaPekerjaanTpu(admin: Page, nomor: string): Promise<string> {
  return langkah(admin, `Admin Platform: daftar Pekerjaan TPU, buka pekerjaan ${nomor}`, async () => {
    await admin.goto("/staf/admin-platform/pekerjaan-tpu");
    const semua = admin.locator('a[href^="/staf/admin-platform/pekerjaan-tpu/"]');
    const milik = semua.filter({ hasText: nomor });
    await ((await milik.count()) > 0 ? milik.first() : semua.first()).click();
    await expect(admin.getByText("Penugasan").first()).toBeVisible();
    return /pekerjaan-tpu\/([0-9a-f-]{36})/.exec(admin.url())?.[1] ?? "";
  });
}

test.describe("Rilis 3 Mitra Jasa [TANPA-BAYAR]", { tag: ["@rilis3", "@tanpabayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("R3-55.1 Admin Platform meng-onboard Mitra Jasa (berkas, rekening, cakupan TPU dan Layanan), lalu Mitra Jasa masuk dengan Kode Masuk", async ({ sebagai }) => {
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Admin Platform: Daftar Mitra Jasa", "/staf/admin-platform/mitra-jasa");
    await langkah(admin, "Buka satu Mitra Jasa: onboarding, berkas, rekening pencairan, TPU dan Layanan yang dilayani", async () => {
      await admin.locator('a[href^="/staf/admin-platform/mitra-jasa/"]').first().click();
      for (const bagian of ["Onboarding", "Berkas", "Rekening Pencairan", "TPU DKI yang dilayani", "Layanan yang dilayani"]) {
        await expect.soft(admin.getByText(bagian).first(), `bagian ${bagian}`).toBeVisible();
      }
    });
    if (punyaPersona("mitra-jasa")) {
      await kunjungi(await sebagai("mitra-jasa"), "Mitra Jasa: masuk dengan Kode Masuk, halaman Pekerjaan Layanan", "/staf/mitra-jasa/pekerjaan", "Pekerjaan Layanan");
    } else {
      await manual(admin, "Mitra Jasa masuk dengan Kode Masuk setelah Undangan Staf", SYARAT_MITRA);
    }
    await manual(admin, "Onboarding Mitra Jasa baru: KTP, NIK, foto, area, rekening bank (nama cocok atau catatan override), tanpa NPWP, cakupan TPU dan Layanan; Undangan Staf terkirim", "dikerjakan owner pada Mitra Jasa uji baru; email undangan dibaca di mailbox");
    await manual(admin, "Baris Tier 4 onboarding sampai lengkap; lencana 'Baru' sampai 5 pekerjaan Selesai", "dibaca owner di Antrean Admin Platform dan daftar Mitra Jasa");
  });

  test("R3-55.2 Mitra Jasa: Tidak tersedia, scorecard 90 hari, Pencairan tanpa Potongan, tak melihat dokumen keluarga atau audit log", async ({ sebagai }) => {
    test.skip(!punyaPersona("mitra-jasa"), SYARAT_MITRA);
    const mitra = await sebagai("mitra-jasa");
    await kunjungi(mitra, "Mitra Jasa: Pekerjaan Layanan dengan Tidak tersedia, Skor 90 hari dan Riwayat", "/staf/mitra-jasa/pekerjaan", "Pekerjaan Layanan");
    for (const bagian of ["Tidak tersedia", "Skor 90 hari", "Riwayat"]) await expect.soft(mitra.getByText(bagian).first(), `bagian ${bagian}`).toBeVisible();
    await kunjungi(mitra, "Mitra Jasa: Pencairan memuat pekerjaan, Layanan, tanggal dan tarif, tanpa Potongan", "/staf/mitra-jasa/pencairan", "Pencairan");
    await expect(mitra.getByText("Potongan")).toHaveCount(0);
    const lokasiId = baca("saatduka.lokasiId");
    if (lokasiId) {
      await langkah(mitra, "Mitra Jasa tidak melihat Audit Log Lokasi", async () => {
        await mitra.goto(`/staf/admin-lokasi/${lokasiId}/audit-log`);
        await expect(mitra.getByRole("heading", { name: /Audit Log/i })).toHaveCount(0);
        await mitra.goto(`/staf/admin-platform/lokasi/${lokasiId}/audit-log`);
        await expect(mitra.getByRole("heading", { name: /Audit Log/i })).toHaveCount(0);
      });
    }
    await manual(mitra, "Tidak tersedia pada tanggal tertentu dihormati picker penugasan; Ditangguhkan atau Berhenti membatalkan penugasan Dijadwalkan dan mendaftar pekerjaan berjalan untuk Admin Platform, Mitra Jasa tetap bisa masuk dan melihat riwayat", "dikerjakan owner dengan Mitra Jasa uji; Admin Platform mengubah status");
    await manual(mitra, "Scorecard 90 hari dan baris tinjauan bulanan; cek tampilan Pencairan (AC3 tiket 55): hanya pekerjaan, Layanan, tanggal dan tarif", "dibaca owner pada screenshot Pencairan dan Antrean Admin Platform");
  });

  test("R3-56.3 Admin Platform menugaskan Mitra Jasa lewat picker; Mitra Jasa menerima; Pemesan melihat nama depan dan foto, Mitra Jasa tak melihat kontak keluarga", async ({ sebagai }) => {
    const nomor = baca("tpu.layanan.nomor");
    test.skip(!nomor, SYARAT_PEKERJAAN);
    test.skip(!punyaPersona("mitra-jasa"), SYARAT_MITRA);
    const admin = await sebagai("admin-platform");
    await bukaPekerjaanTpu(admin, nomor!);
    await langkah(admin, "Penugasan: pilih Mitra Jasa dari picker, Tugaskan", async () => {
      await pilihOpsi(admin, "Pilih Mitra Jasa", { urutan: 1 });
      await admin.getByRole("button", { name: "Tugaskan", exact: true }).click();
      await expect(admin.getByText("Menunggu jawaban").first()).toBeVisible({ timeout: 30_000 });
    });
    const mitra = await sebagai("mitra-jasa");
    await langkah(mitra, "Mitra Jasa: pekerjaan di daftar, Terima; kontak keluarga tidak terlihat", async () => {
      await mitra.goto("/staf/mitra-jasa/pekerjaan");
      await mitra.getByRole("button", { name: "Terima", exact: true }).first().click();
      await expect(mitra.getByRole("button", { name: "Terima", exact: true })).toHaveCount(0, { timeout: 30_000 });
      expect(await mitra.locator("body").innerText(), "nomor telepon Pemesan tidak tampil di halaman Mitra Jasa").not.toContain(DATA.telepon());
    });
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Pemesan: nama depan Mitra Jasa tampil di halaman Layanan", async () => {
      await pemesan.goto(`/layanan/${nomor}`);
      await expect(pemesan.getByTestId("mitra-jasa").first()).toBeVisible({ timeout: 30_000 });
    });
    await manual(admin, "Picker hanya memuat Mitra Jasa Aktif yang mencakup TPU dan Layanan itu dan tidak Tidak tersedia; Peringatan Staf (push dan email) tiba; batas jawab 12 jam atau H-1 18:00; tak menjawab = Tidak direspons dan kembali ke antrean", "dibaca owner di perangkat Mitra Jasa dan mailbox; batas butuh waktu");
    await manual(admin, "Baris Tier 1 'Pekerjaan hari ini tanpa Mitra Jasa' dan baris Tier 2", "dibaca owner di Antrean Admin Platform pada pekerjaan yang belum ditugaskan");
  });

  test("R3-57.1 Mitra Jasa mengambil foto bukti dengan kamera aplikasi, Menunggu Verifikasi; Admin Platform menyetujui, bukti tampil ke Pemesan", async ({ sebagai }) => {
    const nomor = baca("tpu.layanan.nomor");
    test.skip(!nomor, SYARAT_PEKERJAAN);
    test.skip(!punyaPersona("mitra-jasa"), SYARAT_MITRA);
    const mitra = await sebagai("mitra-jasa");
    await langkah(mitra, "Mitra Jasa: foto sebelum dan sesudah dengan kamera aplikasi, Kirim bukti", async () => {
      await mitra.goto("/staf/mitra-jasa/pekerjaan");
      await ambilSemuaBuktiKamera(mitra);
      await mitra.getByRole("button", { name: "Kirim bukti" }).first().click();
      await expect(mitra.getByText("Menunggu Verifikasi").first()).toBeVisible({ timeout: 30_000 });
    });
    const admin = await sebagai("admin-platform");
    await bukaPekerjaanTpu(admin, nomor!);
    await langkah(admin, "Admin Platform: Bukti pekerjaan, Setujui bukti", async () => {
      await expect(admin.getByText("Bukti pekerjaan").first()).toBeVisible();
      await admin.getByRole("button", { name: "Setujui bukti" }).click();
      await expect(admin.getByRole("button", { name: "Setujui bukti" })).toHaveCount(0, { timeout: 30_000 });
    });
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Pemesan: bukti tampil di halaman Layanan, pekerjaan Selesai", async () => {
      await pemesan.goto(`/layanan/${nomor}`);
      await expect(pemesan.getByTestId("bukti-tpu").first()).toBeVisible({ timeout: 30_000 });
      await expect(pemesan.getByText("Selesai").first()).toBeVisible();
    });
    await manual(admin, "Foto bertimestamp sesuai katalog; baris Tier 2 'Foto bukti perlu disetujui' (24 jam); jendela Keluhan 3×24 jam terbuka saat bukti disetujui; bukti ditolak dengan alasan kembali Sedang Dikerjakan ('Tolak, minta ulang')", "dibaca owner di Antrean Admin Platform dan halaman Layanan; jalur tolak dicoba pada pekerjaan lain");
  });

  test("R3-57.2 Aturan bayar Mitra Jasa: kerja ulang, Terlambat, tanpa Potongan, Pencairan hari-H tanpa menunggu keluarga", async ({ sebagai }) => {
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Admin Platform: daftar transfer Pencairan", "/staf/admin-platform/transfer");
    if (punyaPersona("mitra-jasa")) {
      const mitra = await sebagai("mitra-jasa");
      await kunjungi(mitra, "Mitra Jasa: Pencairan hanya pekerjaan, Layanan, tanggal dan tarif", "/staf/mitra-jasa/pencairan", "Pencairan");
      await expect(mitra.getByText("Potongan")).toHaveCount(0);
    }
    await manual(admin, "Kerja ulang oleh orang yang sama tidak dibayar, oleh orang lain dibayar dan Pencairan awal dibatalkan; Terlambat tetapi selesai dibayar penuh; dibatalkan karena terlambat tanpa Pencairan; tidak pernah ada Potongan", "domain diuji di tiket 57; dibaca owner pada daftar Pencairan setelah pekerjaan uji untuk tiap kasus");
    await manual(admin, "Pencairan Layanan hari-H TPU jatuh tempo tanpa menunggu pembayaran keluarga", "dibaca owner pada daftar transfer setelah R3-45.1");
  });

  test("R3-51.1 Keluhan atas pekerjaan TPU: jendela mulai saat Admin Platform menyetujui bukti; baris Tier 1; Penilaian hanya terbaca Admin Platform", async ({ sebagai }) => {
    const nomor = baca("tpu.layanan.nomor");
    test.skip(!nomor, SYARAT_PEKERJAAN);
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Pemesan: ajukan Keluhan dan Penilaian pada pekerjaan yang bukti-nya disetujui", async () => {
      await pemesan.goto(`/layanan/${nomor}`);
      const form = pemesan.getByTestId("keluhan-tpu-form").first();
      await expect(form, "formulir Keluhan terbuka setelah bukti disetujui (R3-57.1)").toBeVisible();
      await form.getByRole("textbox").first().fill("Keluhan uji UAT: pekerjaan TPU mohon diperiksa.");
      await form.getByRole("button", { name: "Ajukan keluhan" }).click();
      await expect(pemesan.getByTestId("keluhan-tpu").first()).toBeVisible({ timeout: 30_000 });
    });
    const admin = await sebagai("admin-platform");
    await langkah(admin, "Admin Platform: baris Keluhan pekerjaan TPU di Antrean, buka, Tolak keluhan", async () => {
      await admin.goto("/staf/admin-platform/antrean");
      await admin.getByText("Keluhan pekerjaan TPU").first().click();
      await expect(admin.getByRole("heading", { name: "Keputusan" })).toBeVisible();
      await admin.getByRole("button", { name: "Tolak keluhan" }).click();
    });
    await kunjungi(admin, "Admin Platform: Penilaian", "/staf/admin-platform/penilaian");
    const lokasi = await sebagai("admin-lokasi");
    await langkah(lokasi, "Admin Lokasi tidak membaca Penilaian", async () => {
      await lokasi.goto("/staf/admin-platform/penilaian");
      await expect(lokasi.getByRole("heading", { name: /Penilaian/ })).toHaveCount(0);
    });
    await manual(pemesan, "Respons pertama Keluhan dalam 4 jam hari; hasil ditolak, kerja ulang atau refund; override Pencairan dengan catatan; tick penutupan jendela membuat Pencairan jatuh tempo; Penilaian 1–5 terbaca Admin Platform saja", "butuh waktu; dibaca owner di Antrean dan halaman keputusan");
  });

  test("R3-52.1 Thread pekerjaan TPU: Pemesan dan Mitra Jasa saling kirim pesan, Mitra Jasa tak melihat nomor telepon Pemesan, Admin Platform membaca dan menulis", async ({ sebagai }) => {
    const nomor = baca("tpu.layanan.nomor");
    test.skip(!nomor, SYARAT_PEKERJAAN);
    test.skip(!punyaPersona("mitra-jasa"), SYARAT_MITRA);
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Pemesan: kirim pesan teks (dan foto) di thread pekerjaan TPU", async () => {
      await pemesan.goto(`/layanan/${nomor}`);
      const thread = pemesan.getByTestId("thread-pekerjaan").first();
      await expect(thread).toBeVisible();
      await thread.getByLabel("Tulis pesan").fill("Pesan uji UAT dari Pemesan untuk Mitra Jasa TPU.");
      const foto = thread.locator('input[type="file"]');
      if ((await foto.count()) > 0) await foto.first().setInputFiles(jpegContoh("pesan.jpg"));
      await thread.getByRole("button", { name: "Kirim pesan" }).click();
      await expect(pemesan.getByText("Pesan uji UAT dari Pemesan untuk Mitra Jasa TPU.").first()).toBeVisible({ timeout: 30_000 });
    });
    const mitra = await sebagai("mitra-jasa");
    await langkah(mitra, "Mitra Jasa: pesan terbaca di thread; nomor telepon Pemesan tidak terlihat", async () => {
      await mitra.goto("/staf/mitra-jasa/pekerjaan");
      await expect(mitra.getByTestId("thread-pekerjaan").first()).toBeVisible();
      await expect(mitra.getByText("Pesan uji UAT dari Pemesan untuk Mitra Jasa TPU.").first()).toBeVisible();
      expect(await mitra.locator("body").innerText(), "nomor telepon Pemesan tidak tampil di thread").not.toContain(DATA.telepon());
    });
    await manual(pemesan, "Email pemberitahuan pesan baru tanpa isi pesan dan dengan tautan balas; Admin Platform membaca dan menulis di thread; thread read-only saat jendela Keluhan tutup", "email dibaca owner di mailbox; thread Admin Platform dibuka dari halaman pekerjaan; read-only butuh 3×24 jam");
  });
});
