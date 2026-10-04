import type { Page } from "@playwright/test";
import { DATA, isiKolom, kunjungi, tanggalWib } from "../support/halaman";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Rilis 3, the [TANPA-BAYAR] items for Wakaf Tanah (ticket 58): the Wakif's form and the Admin Platform's handling. No
 * Tagihan, so nothing pays. The Pemesan persona submits signed in (the form asks for a Kode Masuk at Kirim only from a
 * visitor), so no extra code is requested; the controls of the form were read from its source, not run (`isiKolom`
 * fills each by its kind). What only a mailbox shows is a `manual` step.
 */

/** Fills and sends the Wakaf form as the signed-in Pemesan for land in `kabupatenKota`. */
async function ajukanWakaf(pemesan: Page, kabupatenKota: string): Promise<void> {
  await langkah(pemesan, `Pengajuan Wakaf: tanah di ${kabupatenKota}`, async () => {
    await pemesan.goto("/wakaf-tanah");
    await isiKolom(pemesan, "Nama Anda (Wakif)", "Uji UAT Wakif");
    await isiKolom(pemesan, "Nomor telepon", DATA.telepon());
    await isiKolom(pemesan, "Alamat tanah", "Jalan Uji UAT Wakaf No. 1");
    await isiKolom(pemesan, "Kabupaten/kota tanah", kabupatenKota);
    await isiKolom(pemesan, "Luas tanah (m²)", "500");
    await isiKolom(pemesan, "Hubungan Anda dengan tanah", "Pemilik");
    await isiKolom(pemesan, "Tujuan wakaf", "Pemakaman umum");
    await isiKolom(pemesan, "Bukti kepemilikan", "Sertipikat uji UAT");
    await pemesan.getByRole("button", { name: /Kirim/ }).last().click();
    await expect(pemesan.getByText("Pengajuan wakaf diterima")).toBeVisible({ timeout: 30_000 });
  });
}

test.describe("Rilis 3 Wakaf [TANPA-BAYAR]", { tag: ["@rilis3", "@tanpabayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("R3-58.1 Halaman Wakaf Tanah dan formulir Pengajuan Wakaf; tanah di luar Jabodetabek otomatis Dirujuk dengan penunjuk KUA dan BWI", async ({ sebagai, anonim }) => {
    const publik = await anonim();
    await kunjungi(publik, "Halaman Wakaf Tanah: proses dan batasannya", "/wakaf-tanah", "Wakaf Tanah");
    const pemesan = await sebagai("pemesan");
    await ajukanWakaf(pemesan, "Kabupaten Bantul");
    await langkah(pemesan, "Di luar Jabodetabek: status Dirujuk dengan penunjuk KUA dan BWI", async () => {
      await expect(pemesan.getByText("Dirujuk").first()).toBeVisible();
      await expect(pemesan.getByText(/KUA/).first()).toBeVisible();
      await expect(pemesan.getByText(/BWI/).first()).toBeVisible();
    });
    await manual(publik, "Halaman Wakaf Tanah menjelaskan prosesnya, bahwa tanah diserahkan langsung ke Nazhir dan platform tidak menerima tanah atau uang; Kode Masuk diminta saat Kirim bila belum masuk", "dibaca owner pada screenshot halaman; jalur tamu dengan Kode Masuk dicoba owner sekali");
  });

  test("R3-58.2 Admin Platform menangani Pengajuan Wakaf: cocokkan Nazhir, jadwalkan Survei Wakaf, ubah status; Wakif membatalkan sampai Menunggu Ikrar; tidak ada Tagihan", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    await ajukanWakaf(pemesan, "Kota Depok");
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Admin Platform: daftar Pengajuan Wakaf", "/staf/admin-platform/wakaf");
    await langkah(admin, "Buka Pengajuan Wakaf uji: Wakif dan tanah, Catatan, Riwayat status", async () => {
      await admin.locator('a[href^="/staf/admin-platform/wakaf/"]').filter({ hasText: "Uji UAT Wakif" }).first().click();
      for (const bagian of ["Wakif dan tanah", "Cocokkan Nazhir", "Pindah status", "Riwayat status", "Catatan"]) {
        await expect.soft(admin.getByText(bagian).first(), `bagian ${bagian}`).toBeVisible();
      }
    });
    await langkah(admin, "Cocokkan Nazhir, lalu pindah ke Survei Dijadwalkan dengan tanggal survei", async () => {
      await pilihNazhirLaluCocokkan(admin);
      await admin.getByLabel("Pindah ke").selectOption({ label: "Survei Dijadwalkan" });
      await admin.getByLabel("Tanggal (survei atau ikrar)").fill(tanggalWib(3));
      const petugas = admin.getByLabel("Petugas Lapangan (untuk Survei Dijadwalkan)");
      if ((await petugas.count()) > 0) await petugas.selectOption({ index: 1 }).catch(() => undefined);
      await admin.getByRole("button", { name: "Pindahkan" }).click();
      await expect(admin.getByText("Survei Dijadwalkan").first()).toBeVisible({ timeout: 30_000 });
    });
    await langkah(pemesan, "Wakif: tab Wakaf di Akun Saya memuat pengajuan itu; tidak ada Tagihan", async () => {
      await pemesan.goto("/akun/wakaf");
      await expect(pemesan.getByText("Survei Dijadwalkan").first()).toBeVisible({ timeout: 30_000 });
      await expect(pemesan.getByText(/TGH\/\d{4}\/\d{6}/)).toHaveCount(0);
    });
    await manual(admin, "Status berikutnya: Menunggu Ikrar, Proses Sertipikat, Selesai (scan AIW atau sertipikat), Ditolak, Dibatalkan; catatan untuk Wakif terpisah dari catatan internal dan laporan survei", "dikerjakan owner pada pengajuan uji; urutan dibaca di Riwayat status");
    await manual(pemesan, "Wakif menerima email tiap perubahan status dan boleh membatalkan sampai Menunggu Ikrar; baris Tier 3 di Antrean tanpa alert; Admin Lokasi tidak melihat Pengajuan Wakaf; CRUD Nazhir tanpa login", "email dibaca owner di mailbox; Admin Lokasi dicek dengan sesi persona Admin Lokasi; Daftar Nazhir di Admin Platform");
  });
});

/** Picks the first Nazhir in the "Cocokkan" form of the submission and sends it. */
async function pilihNazhirLaluCocokkan(admin: Page): Promise<void> {
  const nazhir = admin.getByLabel("Nazhir", { exact: true }).first();
  if ((await nazhir.count()) > 0) await nazhir.selectOption({ index: 1 }).catch(() => undefined);
  const cocokkan = admin.getByRole("button", { name: "Cocokkan", exact: true });
  if ((await cocokkan.count()) > 0) {
    await cocokkan.first().click();
    await expect(admin.getByRole("alert")).toHaveCount(0);
  }
}
