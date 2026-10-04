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

/** Fills and sends the Wakaf form as the signed-in Pemesan for land in `kabupatenKota`. Returns the Nomor Pengajuan of this submission. */
async function ajukanWakaf(pemesan: Page, kabupatenKota: string): Promise<string> {
  return langkah(pemesan, `Pengajuan Wakaf: tanah di ${kabupatenKota}`, async () => {
    await pemesan.goto("/wakaf-tanah");
    await isiKolom(pemesan, "Nama Anda (Wakif)", "Uji UAT Wakif");
    await isiKolom(pemesan, "Nomor telepon", DATA.telepon());
    await isiKolom(pemesan, "Alamat tanah", "Jalan Uji UAT Wakaf No. 1");
    await isiKolom(pemesan, "Kabupaten/kota tanah", kabupatenKota);
    await isiKolom(pemesan, "Luas tanah (m²)", "500");
    await isiKolom(pemesan, "Hubungan Anda dengan tanah", "Pemilik");
    // The Tujuan select has no placeholder: `isiKolom` would take its second option, "Keluarga", which asks for a Nama keluarga.
    await pemesan.getByLabel("Tujuan wakaf").selectOption({ label: "Sosial (pemakaman umum)" });
    await isiKolom(pemesan, "Bukti kepemilikan", "Sertipikat uji UAT");
    await pemesan.getByRole("button", { name: /Kirim/ }).last().click();
    await expect(pemesan.getByText("Pengajuan wakaf diterima")).toBeVisible({ timeout: 30_000 });
    // The form sends the Wakif to /wakaf-tanah?nomor=<Nomor Pengajuan>, the page that says "diterima".
    const nomor = new URL(pemesan.url()).searchParams.get("nomor");
    if (!nomor) throw new Error(`Tidak ada Nomor Pengajuan di ${pemesan.url()}`);
    return nomor;
  });
}

test.describe("Rilis 3 Wakaf [TANPA-BAYAR]", { tag: ["@rilis3", "@tanpabayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("R3-58.1 Halaman Wakaf Tanah dan formulir Pengajuan Wakaf; tanah di luar Jabodetabek otomatis Dirujuk dengan penunjuk KUA dan BWI", async ({ sebagai, anonim }) => {
    const publik = await anonim();
    await kunjungi(publik, "Halaman Wakaf Tanah: proses dan batasannya", "/wakaf-tanah", "Wakaf Tanah");
    const pemesan = await sebagai("pemesan");
    const nomor = await ajukanWakaf(pemesan, "Kabupaten Bantul");
    await langkah(pemesan, "Di luar Jabodetabek: status Dirujuk dengan penunjuk KUA dan BWI", async () => {
      // The confirmation page carries the pointer only; the status word "Dirujuk" is on the Wakaf tab of Akun Saya, in the title of this
      // Pengajuan's own card ("<Nomor Pengajuan> · <status>"): the tab lists the ones earlier runs left too, and some of them are Dirujuk as well.
      await expect(pemesan.getByText(/KUA/).first()).toBeVisible();
      await expect(pemesan.getByText(/BWI/).first()).toBeVisible();
      await pemesan.goto("/akun/wakaf");
      await expect(pemesan.getByText(`${nomor} · Dirujuk`).first()).toBeVisible();
    });
    await manual(publik, "Halaman Wakaf Tanah menjelaskan prosesnya, bahwa tanah diserahkan langsung ke Nazhir dan platform tidak menerima tanah atau uang; Kode Masuk diminta saat Kirim bila belum masuk", "dibaca owner pada screenshot halaman; jalur tamu dengan Kode Masuk dicoba owner sekali");
  });

  test("R3-58.2 Admin Platform menangani Pengajuan Wakaf: cocokkan Nazhir, jadwalkan Survei Wakaf, ubah status; Wakif membatalkan sampai Menunggu Ikrar; tidak ada Tagihan", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const nomor = await ajukanWakaf(pemesan, "Kota Depok");
    const admin = await sebagai("admin-platform");
    await kunjungi(admin, "Admin Platform: daftar Pengajuan Wakaf", "/staf/admin-platform/wakaf");
    await langkah(admin, "Buka Pengajuan Wakaf uji: Wakif dan tanah, Catatan, Riwayat status", async () => {
      // A row reads "<nomor> · <Wakif> · <kab/kota>" and only the nomor is the link, so the row is found by its text (the list is newest first).
      await admin.locator("li").filter({ hasText: "Uji UAT Wakif" }).filter({ hasText: "Kota Depok" }).locator('a[href^="/staf/admin-platform/wakaf/"]').first().click();
      for (const bagian of ["Wakif dan tanah", "Cocokkan Nazhir", "Pindah status", "Riwayat status", "Catatan"]) {
        await expect.soft(admin.getByRole("heading", { name: bagian }).first(), `bagian ${bagian}`).toBeVisible();
      }
    });
    await langkah(admin, "Cocokkan Nazhir", async () => {
      await pilihNazhirLaluCocokkan(admin);
    });
    await langkah(admin, "Pindah ke Ditinjau (dari Diajukan hanya Ditinjau, Ditolak dan Dirujuk yang ditawarkan)", async () => {
      await admin.getByLabel("Pindah ke").selectOption({ label: "Ditinjau" });
      await admin.getByRole("button", { name: "Pindahkan" }).click();
      // The second line of the page header reads "<status> · diajukan <waktu>": it changes only once the move is saved.
      await expect(admin.getByText(/^Ditinjau .+ diajukan /)).toBeVisible({ timeout: 30_000 });
    });
    await langkah(admin, "Pindah ke Survei Dijadwalkan dengan tanggal survei dan Petugas Lapangan", async () => {
      await admin.getByLabel("Pindah ke").selectOption({ label: "Survei Dijadwalkan" });
      await admin.getByLabel("Tanggal (survei atau ikrar)").fill(tanggalWib(3));
      // Survei Dijadwalkan is refused without a Petugas Lapangan; option 0 of this select is "Belum dipilih".
      await admin.getByLabel("Petugas Lapangan (untuk Survei Dijadwalkan)").selectOption({ index: 1 });
      await admin.getByRole("button", { name: "Pindahkan" }).click();
      await expect(admin.getByText(/^Survei Dijadwalkan .+ diajukan /)).toBeVisible({ timeout: 30_000 });
    });
    await langkah(pemesan, "Wakif: tab Wakaf di Akun Saya memuat pengajuan itu; tidak ada Tagihan", async () => {
      await pemesan.goto("/akun/wakaf");
      await expect(pemesan.getByText(`${nomor} · Survei Dijadwalkan`).first()).toBeVisible({ timeout: 30_000 });
      await expect(pemesan.getByText(/TGH\/\d{4}\/\d{6}/)).toHaveCount(0);
    });
    await manual(admin, "Status berikutnya: Menunggu Ikrar, Proses Sertipikat, Selesai (scan AIW atau sertipikat), Ditolak, Dibatalkan; catatan untuk Wakif terpisah dari catatan internal dan laporan survei", "dikerjakan owner pada pengajuan uji; urutan dibaca di Riwayat status");
    await manual(pemesan, "Wakif menerima email tiap perubahan status dan boleh membatalkan sampai Menunggu Ikrar; baris Tier 3 di Antrean tanpa alert; Admin Lokasi tidak melihat Pengajuan Wakaf; CRUD Nazhir tanpa login", "email dibaca owner di mailbox; Admin Lokasi dicek dengan sesi persona Admin Lokasi; Daftar Nazhir di Admin Platform");
  });
});

/**
 * Sends the "Cocokkan" form of the submission. Its select has no placeholder and already holds the first Nazhir of the list,
 * so there is nothing to pick. The form is there only while the list holds a Nazhir: a journey that matches one and finds
 * none has found a problem (the Nazhir (Contoh) of the checklist's P6), so it fails instead of going green without matching.
 */
async function pilihNazhirLaluCocokkan(admin: Page): Promise<void> {
  const cocokkan = admin.getByRole("button", { name: "Cocokkan", exact: true });
  await expect(cocokkan, "formulir Cocokkan Nazhir tidak ada: daftar Nazhir kosong (checklist P6; Admin Platform, Wakaf Tanah, Daftar Nazhir)").toBeVisible();
  await cocokkan.click();
  // Not `getByRole("alert")`: Next's route announcer is always an alert on the page. The form says "Nazhir dicocokkan." (a status, and a toast).
  await expect(admin.getByText("Nazhir dicocokkan.").first()).toBeVisible({ timeout: 30_000 });
}
