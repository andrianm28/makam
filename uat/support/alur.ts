import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { bayarDenganQris } from "./bayar";
import { DATA, nomorPemesananDi, persis, tanggalWib } from "./halaman";
import { keluaranDir } from "./keadaan";
import { langkah } from "./langkah";
import { mintaKode } from "./kode";
import { jedaKode, log, timeoutKodeMs, tidur } from "./masuk";
import { emailPersona } from "./persona";

/* Flows more than one journey walks: Perpanjangan to Lunas, and the Saat Duka TPU order. */

/**
 * On a Perpanjangan page (/perpanjangan/<hakPakaiId>): the code to the Pemegang Hak's email when asked,
 * the term, the Tagihan, and the payment through the sandbox. Returns the Tagihan's path.
 */
export async function perpanjangDanBayar(page: Page, halaman: string): Promise<string> {
  await langkah(page, "Perpanjang Makam: kode ke email Pemegang Hak (bila diminta), pilih masa", async () => {
    await page.goto(halaman);
    await expect(page.getByRole("heading", { name: "Perpanjang Makam" })).toBeVisible();
    const kirim = page.getByRole("button", { name: "Kirim kode" });
    if (await kirim.isVisible()) {
      const kode = await mintaKode({
        dir: join(keluaranDir(), "kode"),
        persona: "pemesan",
        jenis: "kode-masuk",
        timeoutMs: timeoutKodeMs(),
        sekarang: () => Date.now(),
        tidur,
        catat: log,
        kirim: async () => {
          await jedaKode().sebelumMintaKode();
          await kirim.click();
        },
      });
      await page.getByLabel("Kode 6 angka").fill(kode);
      await page.getByRole("button", { name: "Masukkan kode" }).click();
    }
    await pilihMasaLaluTagihan(page);
  });
  return bukaTagihanDanBayar(page);
}

/** Chooses the first term on a page that offers `terms` and goes on to the Tagihan. */
export async function pilihMasaLaluTagihan(page: Page): Promise<void> {
  const masa = page.locator('[name="terms"]').first();
  await expect(masa).toBeVisible();
  if ((await masa.evaluate((elemen) => elemen.tagName.toLowerCase())) === "select") await masa.selectOption({ index: 0 });
  else await masa.check();
  await page.getByRole("button", { name: "Lanjut ke Tagihan" }).click();
}

/** Follows "Buka Tagihan" to the Tagihan page and pays it. Returns the Tagihan's path. */
export async function bukaTagihanDanBayar(page: Page): Promise<string> {
  const url = await langkah(page, "Buka Tagihan", async () => {
    await page.getByRole("link", { name: /Buka Tagihan/ }).first().click();
    await expect(page).toHaveURL(/\/dokumen\//);
    return new URL(page.url()).pathname;
  });
  await bayarDenganQris(page, url);
  return url;
}

/** The Saat Duka TPU wizard, from the list to the order page. Returns the Nomor Pemesanan. */
export async function pesanTpuSaatDuka(page: Page, opsi: { layananHariH?: boolean } = {}): Promise<string> {
  return langkah(page, "Saat Duka TPU: pilih TPU, isi data, Kirim pengurusan", async () => {
    await page.goto("/pesan-makam/saat-duka");
    const tpu = process.env.UAT_TPU?.trim();
    const tautan = tpu ? page.getByRole("link", { name: persis(tpu) }).first() : page.locator('a[href*="/pesan-makam/saat-duka/tpu"]').first();
    await tautan.click();
    await expect(page.getByRole("heading", { name: "Data & kirim" })).toBeVisible();
    await page.getByLabel("Nama lengkap", { exact: true }).fill("Uji UAT Pemesan");
    await page.getByLabel("Nomor telepon", { exact: true }).fill(DATA.telepon());
    const email = page.getByLabel("Email", { exact: true });
    if ((await email.isEditable()) && !(await email.inputValue())) await email.fill(emailPersona("pemesan"));
    await page.getByLabel("Nama almarhum / almarhumah").first().fill("Almarhum TPU Uji UAT");
    await page.getByLabel("Tanggal wafat").fill(tanggalWib(0));
    await page.getByLabel("Ya, KTP saya DKI Jakarta").check();
    await page.getByLabel("Ya, meninggal di Jakarta").check();
    if (opsi.layananHariH) {
      const varian = page.locator('select[id^="varian-"]').first();
      if (await varian.count()) await varian.selectOption({ index: 1 });
    }
    await page.getByRole("button", { name: "Kirim pengurusan" }).first().click();
    await expect(page).toHaveURL(/\/(pengurusan|pesanan)\/MKM-\d{4}-\d{6}/, { timeout: 30_000 });
    return nomorPemesananDi(page.url());
  });
}

/** Admin Platform confirms the Saat Duka TPU order from its Tier 1 row; the Tagihan is then pay-after. */
export async function konfirmasiTpuSaatDuka(admin: Page, nomor: string): Promise<void> {
  await langkah(admin, `Admin Platform: baris Konfirmasi TPU Saat Duka ${nomor}, Konfirmasi pemakaman`, async () => {
    const baris = admin.getByRole("link", { name: persis(nomor) }).first();
    await expect(async () => {
      await admin.goto("/staf/admin-platform/antrean");
      await expect(baris).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await baris.click();
    await admin.getByLabel(/Pemakaman/i).first().fill(`${tanggalWib(1)}T10:00`);
    const petugas = admin.locator('select[name="petugasAccountId"]');
    if (await petugas.count()) await petugas.selectOption({ index: 1 }).catch(() => undefined);
    await admin.locator('input[name="kontakTpuName"]').fill("Petugas TPU Uji");
    await admin.locator('input[name="kontakTpuPhone"]').fill("081234500002");
    await admin.getByRole("button", { name: "Konfirmasi pemakaman" }).click();
    await expect(admin.getByRole("button", { name: "Konfirmasi pemakaman" })).toHaveCount(0, { timeout: 30_000 });
  });
}
