import { expect, type Page } from "@playwright/test";
import { bukaTagihanDanBayar } from "./alur";
import { DATA, jpegContoh, nomorPemesananDi, persis, pilihOpsi, tanggalWib } from "./halaman";
import { langkah } from "./langkah";

/*
 * The Pengurusan IPTM filing, from the family's order to the IPTM issued (tickets 47
 * and 48): the steps R3-47.1, R3-47.2 and R3-48.1 share. The order page of the family
 * is /pengurusan/<Nomor Pemesanan>; Admin Platform's is /staf/admin-platform/pengurusan/<Nomor Pemesanan>.
 * Selectors are read from the pages' source (src/app/pengurusan, src/app/staf/admin-platform/pengurusan)
 * and not yet run against a stack.
 */

const halamanAdmin = (nomor: string) => `/staf/admin-platform/pengurusan/${nomor}`;

/** "Sudah dimakamkan? Kami urus IPTM-nya": the filing-only order of the signed-in Pemesan. Returns the Nomor Pemesanan. */
export async function pesanPengurusanIptm(pemesan: Page): Promise<string> {
  return langkah(pemesan, "Sudah dimakamkan? Kami urus IPTM-nya: isi data pengajuan, Pesan pengurusan IPTM", async () => {
    await pemesan.goto("/pesan-makam/pengurusan-iptm");
    const tpu = process.env.UAT_TPU?.trim();
    await pilihOpsi(pemesan, "TPU tempat almarhum dimakamkan", tpu ? { teks: persis(tpu) } : { urutan: 1 });
    await pemesan.locator('input[name="pemesanName"]').fill("Uji UAT Pemesan");
    await pemesan.locator('input[name="phoneNumber"]').fill(DATA.telepon());
    await pemesan.locator('input[name="almarhumName"]').fill("Almarhum IPTM Uji UAT");
    await pemesan.locator('input[name="tanggalWafat"]').fill(tanggalWib(-2));
    await pemesan.getByRole("button", { name: "Pesan pengurusan IPTM" }).click();
    await expect(pemesan).toHaveURL(/\/pengurusan\/MKM-\d{4}-\d{6}/, { timeout: 30_000 });
    return nomorPemesananDi(pemesan.url());
  });
}

/** Uploads every document the order page still asks for (the signed Surat Kuasa included), one form at a time, until it says all were received. */
export async function unggahBerkasPengajuan(pemesan: Page, nomor: string): Promise<void> {
  await langkah(pemesan, `Berkas pengajuan IPTM ${nomor}: unggah semua dokumen yang diminta`, async () => {
    await pemesan.goto(`/pengurusan/${nomor}`);
    const formUnggah = pemesan.locator("form").filter({ has: pemesan.locator('input[name="berkas"]') });
    for (let ke = 0; ke < 15 && (await formUnggah.count()) > 0; ke += 1) {
      const form = formUnggah.first();
      const nama = await form.locator('input[name="nama"]').inputValue();
      await form.locator('input[name="berkas"]').setInputFiles(jpegContoh());
      await form.getByRole("button", { name: "Unggah" }).click();
      // The page lists what is still missing: the form of the document just sent goes away.
      await expect(pemesan.locator(`form:has(input[name="nama"][value="${nama}"])`)).toHaveCount(0, { timeout: 30_000 });
    }
    await expect(formUnggah).toHaveCount(0);
    await expect(pemesan.getByText("Semua berkas sudah kami terima")).toBeVisible();
  });
}

/**
 * Admin Platform's "Dokumen lengkap" (the documents pass, so the pay-first Tagihan is issued), then the Pemesan
 * opens the Tagihan and pays it through the sandbox. Returns the Tagihan's path.
 */
export async function periksaDokumenLaluBayar(pemesan: Page, admin: Page, nomor: string): Promise<string> {
  await langkah(admin, `Admin Platform ${nomor}: Dokumen lengkap, Tagihan bayar-dulu terbit`, async () => {
    await admin.goto(halamanAdmin(nomor));
    await admin.getByRole("button", { name: "Dokumen lengkap" }).click();
    await expect(admin.getByRole("button", { name: "Dokumen lengkap" })).toHaveCount(0, { timeout: 30_000 });
  });
  await langkah(pemesan, "Pemesan: Tagihan bayar-dulu terbit, Menunggu Pembayaran", async () => {
    await pemesan.goto(`/pengurusan/${nomor}`);
    await expect(pemesan.getByRole("link", { name: /Buka Tagihan/ }).first()).toBeVisible({ timeout: 30_000 });
  });
  return bukaTagihanDanBayar(pemesan);
}

/** Admin Platform files the IPTM ("IPTM diajukan"; the Petugas Lapangan for the original papers is optional and left out). */
export async function ajukanIptm(admin: Page, nomor: string): Promise<void> {
  await langkah(admin, `Admin Platform ${nomor}: IPTM diajukan`, async () => {
    await admin.goto(halamanAdmin(nomor));
    await admin.getByRole("button", { name: "IPTM diajukan" }).click();
    await expect(admin.getByRole("button", { name: "IPTM diajukan" })).toHaveCount(0, { timeout: 30_000 });
  });
}

/** Admin Platform records the IPTM as issued: the scan, the date it is valid to, and (on a new burial) the grave's block and number. */
export async function terbitkanIptm(admin: Page, nomor: string, berlakuSampai: string): Promise<void> {
  await langkah(admin, `Admin Platform ${nomor}: Terbitkan IPTM (berlaku sampai ${berlakuSampai})`, async () => {
    await admin.goto(halamanAdmin(nomor));
    await admin.locator('input[name="berkas"]').setInputFiles(jpegContoh("iptm.jpg"));
    await admin.locator('input[name="berlakuSampai"]').fill(berlakuSampai);
    const blok = admin.locator('input[name="blokNomor"]');
    if (await blok.count()) await blok.fill("Blok UAT-1 No. 7");
    await admin.getByRole("button", { name: "Terbitkan IPTM" }).click();
    await expect(admin.getByRole("button", { name: "Terbitkan IPTM" })).toHaveCount(0, { timeout: 30_000 });
  });
}

/** The PTSP's answer to a filed order: fixable (Perlu Perbaikan, one document sent back) or final (Ditolak). */
export async function catatPutusanPtsp(admin: Page, nomor: string, putusan: "perbaikan" | "final", alasan: string): Promise<void> {
  await langkah(admin, `Admin Platform ${nomor}: PTSP menolak (${putusan})`, async () => {
    await admin.goto(halamanAdmin(nomor));
    await admin.locator('select[name="putusan"]').selectOption(putusan);
    await admin.locator('textarea[name="alasan"]').fill(alasan);
    if (putusan === "perbaikan") await admin.locator('input[name="dokumen"]').first().check();
    await admin.getByRole("button", { name: "Catat putusan PTSP" }).click();
    await expect(admin.getByRole("button", { name: "Catat putusan PTSP" })).toHaveCount(0, { timeout: 30_000 });
  });
}
