import { existsSync } from "node:fs";
import { berkasSesi } from "../support/persona";
import { jedaKode, masukDenganKode, simpanSesi } from "../support/masuk";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 1: Masuk dan identitas. Each check that needs a code
 * rides on the one login the persona needs anyway, so the whole section costs no
 * more Kode Masuk than the personas' own first logins (plus one for ".invalid").
 */

const adaSesi = (nama: Parameters<typeof berkasSesi>[1]) => existsSync(berkasSesi(process.env.UAT_SESI_DIR ?? "", nama));

test.describe("§1 Masuk dan identitas", { tag: ["@rilis1"] }, () => {
  test("§1 Pemesan: kode salah ditolak, jeda kirim ulang, kode benar masuk ke Akun Saya", async ({ anonim }) => {
    test.skip(adaSesi("pemesan"), "Pemesan sudah punya sesi tersimpan; hapus sesinya untuk mengulang uji login");
    const page = await anonim();
    await masukDenganKode(page, "pemesan", { kodeSalahDulu: true, jedaKirimUlang: true });
    await langkah(page, "Pemesan mendarat di Akun Saya", async () => {
      await expect(page).toHaveURL(/\/akun$/);
      await expect(page.getByRole("heading", { name: "Akun Saya" })).toBeVisible();
    });
    await simpanSesi(page.context(), "pemesan");
    await manual(page, "Kode Masuk tiba di email dalam beberapa menit", "dinilai owner dari mailbox");
  });

  test("§1 Admin Platform: Kode Masuk lalu TOTP, kode TOTP salah ditolak dengan pesan jelas", async ({ anonim }) => {
    test.skip(adaSesi("admin-platform"), "Admin Platform sudah punya sesi tersimpan; hapus sesinya untuk mengulang uji login");
    const page = await anonim();
    await masukDenganKode(page, "admin-platform", { totpSalahDulu: true });
    await langkah(page, "Admin Platform mendarat di Area Staf", async () => {
      await expect(page).toHaveURL(/\/staf\/admin-platform/);
      await expect(page.getByRole("navigation", { name: "Menu Admin Platform" })).toBeVisible();
    });
    await simpanSesi(page.context(), "admin-platform");
  });

  test("§1 Admin Lokasi: staf mendarat di Area Staf", async ({ sebagai }) => {
    const page = await sebagai("admin-lokasi");
    await langkah(page, "Admin Lokasi mendarat di Area Staf, bukan Akun Saya", async () => {
      await page.goto("/staf");
      await expect(page).toHaveURL(/\/staf\//);
      await expect(page.getByRole("navigation", { name: "Menu Admin Lokasi" })).toBeVisible();
    });
  });

  test("§1 Email .invalid menghasilkan 'gagal kirim', bukan halaman galat framework", async ({ anonim }) => {
    const page = await anonim();
    await langkah(page, "Kirim Kode Masuk ke alamat .invalid", async () => {
      await page.goto("/masuk");
      await page.getByLabel("Email").fill(`uji98.${Date.now()}@contoh.invalid`);
      await jedaKode().sebelumMintaKode();
      await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
      // The app's gagal-kirim state reads "Kode belum bisa dikirim lewat email. Silakan coba lagi."
      await expect(page.getByText(/gagal kirim|belum bisa dikirim/i)).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(/Application error|Internal Server Error|Terjadi kesalahan/i)).toHaveCount(0);
    });
  });

  test("§1 Batas kirim ulang per email dan per IP", async () => {
    await manual(null, "Kirim ulang Kode Masuk menghormati batas per email dan per IP (60 detik, 5 per jam)", "dijaga runner sendiri; perilaku server diuji di test domain identity");
  });
});
