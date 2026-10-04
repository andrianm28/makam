import { bukaDataSaatDuka } from "../support/alur";
import { bayarDenganQris } from "../support/bayar";
import { DATA, bukaBarisAntreanLokasi, isiDataPemesan, kirimLaluMuatUlang, lokasiIdDariNama, nomorPemesananDi, pilihOpsi, tanggalWib } from "../support/halaman";
import { simpan, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/**
 * The Pemakaman date this run records: today, unless UAT_TANGGAL_PEMAKAMAN (YYYY-MM-DD) names an earlier one. A date
 * about ten years back puts the 10-year Hak Pakai near its end, inside the Perpanjangan window that bagian 5 needs
 * (checklist P8); the Catat pemakaman form allows any past date. The date of death is then the day before it.
 */
function tanggalPemakaman(): string {
  const dariEnv = process.env.UAT_TANGGAL_PEMAKAMAN?.trim();
  if (!dariEnv) return tanggalWib(0);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dariEnv)) throw new Error(`UAT_TANGGAL_PEMAKAMAN harus YYYY-MM-DD, bukan "${dariEnv}"`);
  return dariEnv;
}

function tanggalWafat(): string {
  const dariEnv = process.env.UAT_TANGGAL_PEMAKAMAN?.trim();
  if (!dariEnv) return tanggalWib(-1);
  const sehariSebelum = new Date(`${tanggalPemakaman()}T00:00:00Z`);
  sehariSebelum.setUTCDate(sehariSebelum.getUTCDate() - 1);
  return sehariSebelum.toISOString().slice(0, 10);
}

/*
 * Checklist Rilis 1, bagian 4: journey Saat Duka di Lokasi Mitra. Bagian 5 does not extend the Hak Pakai this one leaves
 * (a new 10-year Hak Pakai is not open for Perpanjangan yet): it runs on the record UAT_HAK_PAKAI_PERPANJANGAN names, which
 * may be this one when UAT_TANGGAL_PEMAKAMAN dated the Pemakaman about ten years back. The Rilis 2 tumpang journey does pick
 * this Hak Pakai up (`saatduka.hakPakaiId`) when UAT_HAK_PAKAI_TUMPANG is not set. [BAYAR]: the pay-after Tagihan is paid
 * through the sandbox.
 */

test.describe("§4 Saat Duka (Lokasi Mitra)", { tag: ["@rilis1", "@bayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("§4 Pemesan memilih Lokasi × Jenis Makam dan mengirim data Almarhum", async ({ sebagai }) => {
    const page = await sebagai("pemesan");
    await langkah(page, "Pilih makam: daftar Lokasi × Jenis Makam, pilih kartu", async () => {
      await bukaDataSaatDuka(page);
    });
    await langkah(page, "Data & kirim: Almarhum dan Pemesan, Kirim pesanan", async () => {
      await expect(page.getByText("Belum ada yang dibayar sekarang.")).toBeVisible();
      await isiDataPemesan(page);
      await page.getByLabel("Nama almarhum / almarhumah").fill("Almarhum Uji UAT");
      await page.getByLabel("Tanggal wafat").fill(tanggalWafat());
      await page.getByRole("button", { name: "Kirim pesanan" }).first().click();
      await expect(page).toHaveURL(/\/pesanan\/MKM-\d{4}-\d{6}$/, { timeout: 30_000 });
      simpan("saatduka.nomor", nomorPemesananDi(page.url()));
      await expect(page.locator("[data-slot=status-badge]")).toHaveText("Diajukan");
      // "Yang dipesan" names the Lokasi in full; one that only contains the name ("… (Contoh)") fails here, not a journey later.
      await expect(page.getByRole("link", { name: DATA.lokasiSaatDuka(), exact: true }).first()).toBeVisible();
    });
    await manual(page, "Kirim pesanan sebagai tamu di wizard Saat Duka (Kode Masuk di langkah terakhir)", "wizard ini signed-in di sini supaya satu jam cukup untuk lima kode; jalur tamu wizard Terencana ada di bagian 2, jalur tamu Saat Duka dicek owner atau diulang dengan sesi Pemesan dihapus");
  });

  test("§4 Admin Lokasi mengonfirmasi dari baris Konfirmasi Saat Duka (Tagihan bayar-belakang)", async ({ sebagai }) => {
    const nomor = wajib("saatduka.nomor", "§4 Saat Duka");
    const page = await sebagai("admin-lokasi");
    const lokasiId = await lokasiIdDariNama(page, DATA.lokasiSaatDuka());
    simpan("saatduka.lokasiId", lokasiId);
    await bukaBarisAntreanLokasi(page, lokasiId, "Konfirmasi Saat Duka", nomor);
    await langkah(page, "Konfirmasi pesanan: pilih Petak Makam dan waktu pemakaman", async () => {
      await pilihOpsi(page, "Petak Makam");
      await page.getByLabel("Pemakaman", { exact: true }).fill(`${tanggalWib(1)}T10:00`);
      await kirimLaluMuatUlang(page, page.getByRole("button", { name: "Konfirmasi pesanan" }));
      // The card closes once the order is Dikonfirmasi; a refusal leaves it (and its message) on the page.
      await expect(page.getByRole("button", { name: "Konfirmasi pesanan" }), "Pesanan tidak terkonfirmasi").toHaveCount(0);
    });
  });

  test("§4 Admin Lokasi mencatat Pemakaman, keluarga membayar Tagihan, order Selesai dengan Bukti Pemesanan", async ({ sebagai }) => {
    const nomor = wajib("saatduka.nomor", "§4 Saat Duka");
    const lokasiId = wajib("saatduka.lokasiId", "§4 Saat Duka");
    const admin = await sebagai("admin-lokasi");
    await langkah(admin, "Catat Pemakaman (tanggal hari ini, lapis 1)", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
      await admin.getByLabel("Tanggal pemakaman").fill(tanggalPemakaman());
      await admin.getByLabel("Lapis").fill("1");
      await kirimLaluMuatUlang(admin, admin.getByRole("button", { name: "Catat pemakaman" }));
      // The card closes once the order is Dimakamkan; a refusal leaves it (and its message) on the page.
      await expect(admin.getByRole("button", { name: "Catat pemakaman" }), "Pemakaman tidak tercatat").toHaveCount(0);
    });

    const page = await sebagai("pemesan");
    await langkah(page, "Pesanan sudah dikonfirmasi: buka Tagihan bayar-belakang", async () => {
      await page.goto(`/pesanan/${nomor}`);
      await expect(page.getByTestId("pesanan-dikonfirmasi")).toBeVisible();
      await page.getByRole("link", { name: /TGH\/\d{4}\/\d{6}/ }).first().click();
      await expect(page).toHaveURL(/\/dokumen\//);
      simpan("saatduka.tagihanUrl", new URL(page.url()).pathname);
    });
    await bayarDenganQris(page, wajib("saatduka.tagihanUrl", "§4 Saat Duka"));
    await langkah(page, "Order Selesai: Bukti Pemesanan terbit", async () => {
      await page.goto(`/pesanan/${nomor}`);
      await expect(page.locator("[data-slot=status-badge]")).toHaveText("Selesai", { timeout: 30_000 });
      await expect(page.getByTestId("bukti-pemesanan")).toBeVisible();
    });
    await langkah(page, "Hak Pakai tercatat di Makam Keluarga; Perpanjang tersedia", async () => {
      await page.goto("/akun/makam");
      const tautan = page.getByRole("link", { name: /Perpanjang/i }).first();
      await expect(tautan).toBeVisible();
      const id = /perpanjangan\/([0-9a-f-]{36})/.exec((await tautan.getAttribute("href")) ?? "")?.[1];
      if (id) simpan("saatduka.hakPakaiId", id);
    });
    await manual(page, "Denah publik: Petak menjadi Terisi", "dilihat owner di Denah Lokasi pada screenshot Admin Lokasi atau halaman Lokasi");
  });
});
