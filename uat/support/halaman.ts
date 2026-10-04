import { expect, type Locator, type Page } from "@playwright/test";
import { wibDateOf } from "../../src/lib/time/jakarta";
import { langkah } from "./langkah";
import { emailPersona } from "./persona";

/*
 * What the journeys share: the data they need on staging (names that can be
 * changed through the environment), small helpers for the form controls the app
 * uses, and the walk through the staff queues.
 */

export function env(nama: string, bawaan: string): string {
  return process.env[nama]?.trim() || bawaan;
}

/** An optional staging value (an id of a test record) from the environment, or null: a journey without its data skips and says which variable to set. */
export function envOpsional(nama: string): string | null {
  return process.env[nama]?.trim() || null;
}

/** The staging data a run needs. The defaults are the Lokasi of the 2026-10 UAT; set the variables for other data. */
export const DATA = {
  /** The phone number the personas give on forms (one number per Akun; set it if staging already has it on another Akun). */
  telepon: () => env("UAT_TELEPON", "081234500001"),
  /** Terencana: a Lokasi with a Petak Tersedia whose all-in total is under the QRIS cap of Rp 10 juta. */
  lokasiTerencana: () => env("UAT_LOKASI_TERENCANA", "Pemakaman Wakaf Al-Ikhlas"),
  petakTerencana: () => env("UAT_PETAK_TERENCANA", "A-01"),
  /** Another Petak Tersedia of that Lokasi, for the checkout walk that must not take the one the main order holds. */
  petakTerencanaLayanan: () => env("UAT_PETAK_TERENCANA_LAYANAN", "A-02"),
  /** Saat Duka: a fixed-term Jenis Makam under the cap, so the Hak Pakai can later be extended. */
  lokasiSaatDuka: () => env("UAT_LOKASI_SAAT_DUKA", "Makam Masjid Nurul Huda"),
  jenisSaatDuka: () => env("UAT_JENIS_SAAT_DUKA", "10 tahun"),
  /** A Lokasi whose cheapest Petak passes the Rp 10 juta QRIS cap (optional: the cap case is skipped without it). */
  lokasiDiAtasBatas: () => process.env.UAT_LOKASI_DI_ATAS_BATAS?.trim() || null,
  /** The throw-away Lokasi for Ditangguhkan and Berhenti, which cannot be undone. */
  lokasiBerhenti: () => process.env.UAT_LOKASI_BERHENTI?.trim() || null,
};

/** The Pemesan's own data on a booking form: name, phone and, when the form asks and holds none yet, the persona's email. */
export async function isiDataPemesan(page: Page): Promise<void> {
  await page.getByLabel("Nama lengkap", { exact: true }).fill("Uji UAT Pemesan");
  await page.getByLabel("Nomor telepon", { exact: true }).fill(DATA.telepon());
  const email = page.getByLabel("Email", { exact: true });
  if ((await email.isEditable()) && !(await email.inputValue())) await email.fill(emailPersona("pemesan"));
}

/** The three places a booking checkout offers Layanan: the id prefix the shared picker (`PilihLayanan`) gives its fields. */
export type PermukaanLayanan = "petak-kosong" | "hari-h" | "tambah-layanan";

/** The variant `pilihLayananCheckout` chose: its name, and its price as the digits the checkout showed ("Rp 1.200.000" is "1200000"). */
export interface PilihanLayanan {
  nama: string;
  harga: string;
}

/**
 * Picks the first variant of the first Layanan the checkout offers, fills the text it asks for and, where the family
 * chooses the day (every surface but hari-H), the earliest date it allows. It FAILS when the checkout offers none: a
 * journey that asks for a Layanan and finds no picker has found a problem (the Layanan data of the checklist's P4 and
 * P6, or the page) and must not go green without one. Returns the variant, so a later step can look for its row in the Tagihan.
 */
export async function pilihLayananCheckout(page: Page, permukaan: PermukaanLayanan): Promise<PilihanLayanan> {
  const pilih = page.locator(`select[id^="${permukaan}-"]`).first();
  await expect(pilih, `checkout "${permukaan}" tidak menawarkan Layanan: periksa data Layanan Lokasi dan Mitra Jasa (checklist P4, P6)`).toBeVisible({ timeout: 15_000 });
  // The option reads "<varian> — Rp 1.200.000" (src/components/layanan/pilih-layanan.tsx).
  const [nama, harga = ""] = ((await pilih.locator("option").nth(1).textContent()) ?? "").split(" — ");
  await pilih.selectOption({ index: 1 });
  const teks = page.locator(`input[id^="${permukaan}-teks-"]`).first();
  await teks.waitFor({ state: "visible", timeout: 1_000 }).then(() => teks.fill("Teks contoh uji UAT"), () => undefined);
  if (permukaan !== "hari-h") {
    const tanggal = page.locator(`input[id^="${permukaan}-tanggal-"]`).first();
    await expect(tanggal, "kolom tanggal pengerjaan muncul setelah varian dipilih").toBeVisible();
    await tanggal.fill((await tanggal.getAttribute("min")) || tanggalWib(7));
  }
  return { nama: nama.trim(), harga: harga.replace(/\D/g, "") };
}

/** A regular expression that matches `teks` literally, ignoring case. */
export function persis(teks: string): RegExp {
  return new RegExp(teks.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

/** The WIB calendar date `hari` days from today, "YYYY-MM-DD". */
export function tanggalWib(hari = 0, sekarang: Date = new Date()): string {
  return wibDateOf(new Date(sekarang.getTime() + hari * 86_400_000));
}

/** The Nomor Pemesanan (MKM-2026-000001) on a page's text or address, or throws. */
export function nomorPemesananDi(teks: string): string {
  const nomor = /MKM-\d{4}-\d{6}/.exec(teks)?.[0];
  if (!nomor) throw new Error(`Tidak ada Nomor Pemesanan di: ${teks.slice(0, 200)}`);
  return nomor;
}

/**
 * Picks an option in a form control found by its label, whether it is a native
 * `<select>` or the app's own listbox. `urutan` counts the real options from 1
 * (the placeholder is never one); `teks` picks by what the option says.
 */
export async function pilihOpsi(page: Page, label: string | RegExp, pilihan: { urutan?: number; teks?: string | RegExp } = {}): Promise<void> {
  const kontrol = page.getByLabel(label).first();
  const jenis = await kontrol.evaluate((elemen) => elemen.tagName.toLowerCase());
  if (jenis === "select") {
    if (pilihan.teks) {
      const semua = await kontrol.locator("option").allTextContents();
      const cocok = semua.find((teks) => (typeof pilihan.teks === "string" ? teks.includes(pilihan.teks) : pilihan.teks!.test(teks)));
      if (!cocok) throw new Error(`Tidak ada opsi ${String(pilihan.teks)} di "${String(label)}": ${semua.join(" | ")}`);
      await kontrol.selectOption({ label: cocok });
    } else {
      await kontrol.selectOption({ index: pilihan.urutan ?? 1 });
    }
    return;
  }
  await kontrol.click();
  const opsi = pilihan.teks ? page.getByRole("option", { name: pilihan.teks }) : page.getByRole("option").nth((pilihan.urutan ?? 1) - 1);
  await opsi.first().click();
}

/**
 * The id of a Lokasi by its name, read from its public page link (so no staff session is needed to find it). The name
 * must be the whole name: "Makam Masjid Nurul Huda" is not "Makam Masjid Nurul Huda (Contoh)", a Lokasi of its own.
 */
export async function lokasiIdDariNama(page: Page, nama: string): Promise<string> {
  await page.goto("/lokasi");
  const href = (await page.getByRole("link", { name: nama, exact: true }).first().getAttribute("href")) ?? "";
  const id = /\/lokasi\/([0-9a-f-]{36})/.exec(href)?.[1];
  if (!id) throw new Error(`Lokasi "${nama}" tidak ada di daftar Lokasi publik (/lokasi).`);
  return id;
}

/** The id of the Lokasi the Admin Lokasi on `page` manages (the staff home redirects to the first one). */
export async function lokasiIdAdminLokasi(page: Page): Promise<string> {
  await page.goto("/staf/admin-lokasi");
  await expect(page).toHaveURL(/\/staf\/admin-lokasi\/[0-9a-f-]{36}/);
  return /\/staf\/admin-lokasi\/([0-9a-f-]{36})/.exec(page.url())![1];
}

/** Opens a page and checks it is a page of the app: it answers, shows a heading, and is not an error page. */
export async function kunjungi(page: Page, judul: string, path: string, judulHalaman?: string | RegExp): Promise<void> {
  await langkah(page, judul, async () => {
    const respons = await page.goto(path);
    expect(respons?.status() ?? 200, `${path} membalas`).toBeLessThan(400);
    await expect(page.getByRole("heading").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Halaman tidak ditemukan|Terjadi kesalahan|Application error/i })).toHaveCount(0);
    if (judulHalaman) await expect.soft(page.getByRole("heading", { name: judulHalaman }).first()).toBeVisible();
  });
}

/**
 * Opens the Antrean Lokasi of the Lokasi and then the row of kind `jenisBaris` for `nomor`
 * (a Nomor Pemesanan, Nomor Tagihan or other subject text the row's link carries).
 */
export async function bukaBarisAntreanLokasi(page: Page, lokasiId: string, jenisBaris: string | RegExp, nomor: string): Promise<void> {
  await langkah(page, `Antrean Lokasi: baris ${jenisBaris} untuk ${nomor}`, async () => {
    const baris = page.getByRole("link", { name: persis(nomor) }).first();
    await expect(async () => {
      await page.goto(`/staf/admin-lokasi/${lokasiId}/antrean`);
      await expect(baris).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 90_000, intervals: [3_000] });
    await expect.soft(page.getByText(jenisBaris, { exact: typeof jenisBaris === "string" }).first()).toBeVisible();
    await baris.click();
  });
}

/** The Nomor Tagihan (TGH/2026/000001) in a page's text, or undefined. */
export function nomorTagihanDi(teks: string): string | undefined {
  return /TGH\/\d{4}\/\d{6}/.exec(teks)?.[0];
}

/**
 * Submits a form through its button and waits for the Server Action to answer, then reloads, so what follows reads the page as
 * the server now has it. "The button is gone" alone proves nothing: while the action runs the button is renamed ("Mencatat…",
 * "Menyimpan…"), so a count of 0 passes at once even when the action is then refused.
 */
export async function kirimLaluMuatUlang(page: Page, tombol: Locator): Promise<void> {
  await Promise.all([
    page.waitForResponse((jawaban) => jawaban.request().method() === "POST" && Boolean(jawaban.request().headers()["next-action"]), { timeout: 30_000 }),
    tombol.click(),
  ]);
  await expect(page.getByRole("alert").filter({ hasText: /\S/ }), "aksi ditolak").toHaveCount(0);
  await page.reload();
}

/** A tiny valid JPEG, for a form that wants a photo or a scan. */
export function jpegContoh(nama = "bukti.jpg") {
  return { name: nama, mimeType: "image/jpeg", buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("contoh bukti uat")]) };
}

/**
 * On a job page of the staff (Admin Lokasi's Layanan, a Mitra Jasa's TPU job): takes every photo the page still asks for with the
 * app's camera (Chromium's fake one answers): open the camera, wait for its first frame, take the picture, save it. A proof that is
 * in says "Sudah ada. Ambil ulang kalau mau mengganti." on its own block (`bukti-<jenis>`, on a Mitra Jasa's page `bukti-tpu-<jenis>`),
 * and that is the only sign it is done: the "Ambil dengan kamera" button stays on a block, and so do the picture and "Simpan bukti"
 * after a save, so neither tells the page has no more to ask. A video proof ("Selesai merekam") is not taken here; the last lines refuse.
 */
export async function ambilSemuaBuktiKamera(page: Page): Promise<void> {
  const belum = page.locator('[data-testid^="bukti-"][data-testid*="foto_"]').filter({ hasNotText: "Sudah ada" });
  for (let bukti = 0; bukti < 4; bukti += 1) {
    const sisa = await belum.count();
    if (sisa === 0) break;
    const blok = belum.first();
    await blok.getByRole("button", { name: "Ambil dengan kamera" }).click();
    // "Ambil foto" is on screen while the camera is still opening, and a click before its first frame takes nothing.
    const kamera = blok.getByLabel("Pratinjau kamera");
    await expect(kamera).toBeVisible();
    await expect.poll(() => kamera.evaluate((video) => (video as HTMLVideoElement).videoWidth), { message: "kamera belum menampilkan gambar" }).toBeGreaterThan(0);
    await blok.getByRole("button", { name: "Ambil foto" }).click();
    await blok.getByRole("button", { name: "Simpan bukti" }).click();
    await expect(belum).toHaveCount(sisa - 1, { timeout: 30_000 });
  }
  // What is still missing: on an Admin Lokasi's page the line "Kurang: …" (`bukti-kurang`), on a Mitra Jasa's the hint under a disabled "Kirim bukti".
  await expect(page.getByTestId("bukti-kurang")).toHaveCount(0);
  await expect(page.getByText("Ambil semua foto yang diminta dulu.")).toHaveCount(0);
}

/**
 * Fills a form control found by its label whatever kind it is: a text box is typed into, a select takes its first real
 * option (the placeholder is never one), a file input takes a small valid picture. For the forms whose control type this
 * runner has not seen run (the Wakaf form).
 */
export async function isiKolom(page: Page, label: string | RegExp, nilai: string): Promise<void> {
  const kontrol = page.getByLabel(label).first();
  const jenis = await kontrol.evaluate((elemen) => (elemen.tagName === "INPUT" ? `input:${(elemen as HTMLInputElement).type}` : elemen.tagName.toLowerCase()));
  if (jenis === "select") await kontrol.selectOption({ index: 1 });
  else if (jenis === "input:file") await kontrol.setInputFiles(jpegContoh());
  else await kontrol.fill(nilai);
}
