import { expect, type Locator, type Page } from "@playwright/test";
import { bayarDenganQris } from "./bayar";
import { DATA, isiDataPemesan, jpegContoh, kirimLaluMuatUlang, nomorPemesananDi, persis, pilihLayananCheckout, tanggalWib } from "./halaman";
import { langkah } from "./langkah";
import { mintaKodeMasuk } from "./masuk";
import { emailPersona, type NamaPersona } from "./persona";

/* Flows more than one journey walks: Perpanjangan to Lunas, the document request of a Perpanjangan (the Pemesan's file, Admin Lokasi's approval), the anonymous Kirim pesanan, and the Saat Duka TPU order. */

/**
 * On a Perpanjangan page (/perpanjangan/<hakPakaiId>): the code to the Pemegang Hak's email when asked,
 * the term, optionally a Layanan at checkout ("Tambah Layanan"), the Tagihan, and the payment through the
 * sandbox. Returns the Tagihan's path.
 */
export async function perpanjangDanBayar(page: Page, halaman: string, opsi: { tambahLayanan?: boolean } = {}): Promise<string> {
  await langkah(page, "Perpanjang Makam: kode ke email Pemegang Hak (bila diminta), pilih masa", async () => {
    await page.goto(halaman);
    await expect(page.getByRole("heading", { name: "Perpanjang Makam" })).toBeVisible();
    const kirim = page.getByRole("button", { name: "Kirim kode" });
    if (await kirim.isVisible()) {
      const kode = await mintaKodeMasuk("pemesan", async () => {
        await kirim.click();
      });
      await page.getByLabel("Kode 6 angka").fill(kode);
      await page.getByRole("button", { name: "Masukkan kode" }).click();
    }
    await pilihMasaLaluTagihan(page, opsi);
  });
  return bukaTagihanDanBayar(page);
}

/**
 * Chooses the first term on a page that offers `terms`, adds a Layanan at checkout when asked (it fails when the
 * page offers none), and goes on to the Tagihan.
 */
export async function pilihMasaLaluTagihan(page: Page, opsi: { tambahLayanan?: boolean } = {}): Promise<void> {
  const masa = page.locator('[name="terms"]').first();
  await expect(masa).toBeVisible();
  if ((await masa.evaluate((elemen) => elemen.tagName.toLowerCase())) === "select") await masa.selectOption({ index: 0 });
  else await masa.check();
  if (opsi.tambahLayanan) await pilihLayananCheckout(page, "tambah-layanan");
  await page.getByRole("button", { name: "Lanjut ke Tagihan" }).click();
}

/** Follows "Buka Tagihan" to the Tagihan page and pays it. Returns the Tagihan's path. */
export async function bukaTagihanDanBayar(page: Page): Promise<string> {
  const url = await langkah(page, "Buka Tagihan", async () => {
    // "Lanjut ke Tagihan" now lands on the Tagihan itself (2026-10-05); an older page showed a "Buka Tagihan" link first.
    // `.first()` on the union: a Layanan order page (/layanan/<nomor>) has the "Tagihan" heading and the "Buka Tagihan" link together, and two matches fail strict mode.
    await expect(page.getByRole("link", { name: /Buka Tagihan/ }).first().or(page.getByRole("heading", { name: "Tagihan", exact: true })).first()).toBeVisible({ timeout: 30_000 });
    if (!/\/dokumen\//.test(page.url())) await page.getByRole("link", { name: /Buka Tagihan/ }).first().click();
    await expect(page).toHaveURL(/\/dokumen\//);
    return new URL(page.url()).pathname;
  });
  await bayarDenganQris(page, url);
  return url;
}

/**
 * The Antrean Lokasi row of one Perpanjangan request: its link is that request's review page, so the id at the end of the request's
 * own path (what `ajukanPermohonanBerkas` returns) finds it among the older rows an earlier run left open.
 */
export function barisPermohonan(admin: Page, permohonan: string): Locator {
  return admin.locator(`a[href$="/perpanjangan/${permohonan.split("/").pop()}"]`);
}

/**
 * The Pemesan's file request to extend a Hak Pakai by documents, by the path (`jalur`, as the page's `?jalur=` names it).
 * Returns the request page's path.
 */
export async function ajukanPermohonanBerkas(pemesan: Page, hakPakai: string, jalur: "ktp" | "ahli_waris" | "klaim"): Promise<string> {
  return langkah(pemesan, `Perpanjang lewat berkas: jalur ${jalur}, unggah semua berkas, Ajukan permohonan`, async () => {
    // The paths are links only for a Hak Pakai that fits more than one (KTP and ahli waris); a claim has no links, its form at once.
    // So the address names the path, and since the page falls back to the first path it offers, the path it shows is checked.
    await pemesan.goto(`/perpanjangan/${hakPakai}/berkas?jalur=${jalur}`);
    await expect(pemesan.locator('input[name="jalur"]')).toHaveValue(jalur);
    await pemesan.getByLabel("Nama lengkap Anda").fill("Uji UAT Pemesan");
    await pemesan.locator('input[name="nomorTelepon"]').fill(DATA.telepon());
    for (const kolom of await pemesan.locator('input[type="file"]').all()) await kolom.setInputFiles(jpegContoh());
    await pemesan.getByRole("button", { name: "Ajukan permohonan" }).click();
    await expect(pemesan).toHaveURL(/\/perpanjangan\/permohonan\/[0-9a-f-]{36}/, { timeout: 30_000 });
    return new URL(pemesan.url()).pathname;
  });
}

/**
 * Admin Lokasi opens the "Periksa dokumen Perpanjangan" row of the request at `permohonan` and approves it, leaving the recorded name and
 * phone as they are. The module requires a reason (`setujuiPermohonanSchema`) though its textarea is not marked required, so one is always
 * written; the end date is filled only when the form asks for it (a Hak Pakai flagged Perlu Verifikasi that has none).
 */
export async function setujuiPermohonan(admin: Page, lokasiId: string, permohonan: string): Promise<void> {
  await langkah(admin, "Admin Lokasi: baris Periksa dokumen Perpanjangan, Setujui permohonan", async () => {
    await admin.goto(`/staf/admin-lokasi/${lokasiId}/antrean`);
    await expect(admin.getByText("Periksa dokumen Perpanjangan", { exact: true }).first()).toBeVisible();
    // This request's own row (its link ends in the request's id), not the soonest due one, which may be another family's.
    await barisPermohonan(admin, permohonan).click();
    // The click is a client navigation and count() does not wait: wait for the approval card before looking for its optional date.
    await expect(admin.getByTestId("setujui-permohonan")).toBeVisible();
    const berakhir = admin.locator('input[name="endDate"]');
    if (await berakhir.count()) await berakhir.fill(tanggalWib(30));
    await admin.getByLabel("Alasan (dicatat di Audit Log)").fill("Uji UAT: berkas sesuai");
    await admin.getByTestId("setujui-permohonan").click();
    await expect(admin.getByTestId("setujui-permohonan")).toHaveCount(0, { timeout: 30_000 });
  });
}

/**
 * The anonymous visitor's last step in a booking wizard (Terencana, Saat Duka): "Kirim pesanan" opens the Kode Masuk
 * step with the email already in it, the code the owner reads out is typed, and the same button then sends the order.
 * The visitor is signed in as `nama` afterwards.
 */
export async function kirimPesananDenganKodeMasuk(page: Page, nama: NamaPersona): Promise<void> {
  const email = emailPersona(nama);
  await langkah(page, `Kirim pesanan sebagai tamu: langkah Kode Masuk untuk ${nama}`, async () => {
    await page.getByRole("button", { name: /Kirim pesanan/ }).first().click();
    await expect(page.getByRole("button", { name: "Kirim Kode Masuk" })).toBeVisible({ timeout: 15_000 });
  });
  const kode = await mintaKodeMasuk(nama, async () => {
    await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
    await expect(page.getByTestId("kode-masuk-email")).toHaveText(email, { timeout: 30_000 });
  });
  await langkah(page, "Kode Masuk benar: pesanan terkirim", async () => {
    await page.getByLabel("Kode Masuk").fill(kode);
    await page.getByRole("button", { name: /Kirim pesanan/ }).click();
  });
}

/**
 * Saat Duka at a Lokasi Mitra: picks the Lokasi × Jenis Makam card and goes on to "Data & kirim". The Lokasi is found by
 * its exact name, through its card group ("Jenis Makam di <nama>"), never by a piece of text in the card: staging also
 * carries a "<nama> (Contoh)" copy of each Lokasi (Data Contoh, tickets 109 and 111), the list is sorted by the lowest
 * total, and the copy is the cheaper one, so a substring match picks it, a Lokasi the Admin Lokasi persona does not manage.
 */
export async function bukaDataSaatDuka(page: Page): Promise<void> {
  await page.goto("/pesan-makam/saat-duka");
  await expect(page.getByRole("heading", { name: "Pilih makam" })).toBeVisible();
  const kartu = page
    .getByRole("radiogroup", { name: `Jenis Makam di ${DATA.lokasiSaatDuka()}`, exact: true })
    .getByRole("radio")
    .filter({ hasText: persis(DATA.jenisSaatDuka()) })
    .first();
  await kartu.click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await expect(page).toHaveURL(/\/pesan-makam\/saat-duka\/data/);
}

/** The Saat Duka TPU wizard's "Data & kirim": from the list, the TPU `UAT_TPU` names or the first one offered. */
export async function bukaDataTpu(page: Page): Promise<void> {
  await page.goto("/pesan-makam/saat-duka");
  await expect(page.getByRole("heading", { name: "Pilih makam" })).toBeVisible();
  // The TPU DKI cards are radios in the "TPU DKI" group of the one Pilih makam list (with the Lokasi Mitra), then "Lanjut"; not links.
  const grup = page.getByRole("radiogroup", { name: "TPU DKI", exact: true });
  const tpu = process.env.UAT_TPU?.trim();
  const kartu = tpu ? grup.getByRole("radio").filter({ hasText: persis(tpu) }).first() : grup.getByRole("radio").first();
  await kartu.click();
  await page.getByRole("button", { name: "Lanjut" }).click();
  await expect(page.getByRole("heading", { name: "Data & kirim" })).toBeVisible();
}

/** The Saat Duka TPU wizard, from the list to the order page. Returns the Nomor Pemesanan. */
export async function pesanTpuSaatDuka(page: Page, opsi: { layananHariH?: boolean } = {}): Promise<string> {
  return langkah(page, "Saat Duka TPU: pilih TPU, isi data, Kirim pengurusan", async () => {
    await bukaDataTpu(page);
    await isiDataPemesan(page);
    await page.getByLabel("Nama almarhum / almarhumah").first().fill("Almarhum TPU Uji UAT");
    await page.getByLabel("Tanggal wafat").fill(tanggalWib(0));
    // Pilihan renders each option as <button role="radio"> in a radiogroup: it has no label to find it by.
    await page.getByRole("radio", { name: "Ya, KTP saya DKI Jakarta" }).click();
    await page.getByRole("radio", { name: "Ya, meninggal di Jakarta" }).click();
    if (opsi.layananHariH) await pilihLayananCheckout(page, "hari-h");
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
    await kirimLaluMuatUlang(admin, admin.getByRole("button", { name: "Konfirmasi pemakaman" }));
    // The card gives way to "Sudah dikonfirmasi" once the order is confirmed; a refusal leaves it (and its message) on the page.
    await expect(admin.getByRole("button", { name: "Konfirmasi pemakaman" }), "Konfirmasi pemakaman tidak tercatat").toHaveCount(0);
  });
}
