import { bayarDenganQris } from "../support/bayar";
import { DATA, bukaBarisAntreanLokasi, lokasiIdDariNama, nomorPemesananDi, persis, pilihOpsi, tanggalWib } from "../support/halaman";
import { simpan, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { emailPersona } from "../support/persona";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 4: journey Saat Duka di Lokasi Mitra. The Hak Pakai it
 * leaves (fixed-term, under the QRIS cap) is the one bagian 5 extends. [BAYAR]: the
 * pay-after Tagihan is paid through the sandbox.
 */

test.describe("§4 Saat Duka (Lokasi Mitra)", { tag: ["@rilis1", "@bayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("§4 Pemesan memilih Lokasi × Jenis Makam dan mengirim data Almarhum", async ({ sebagai }) => {
    const page = await sebagai("pemesan");
    await langkah(page, "Pilih makam: daftar Lokasi × Jenis Makam, pilih kartu", async () => {
      await page.goto("/pesan-makam/saat-duka");
      await expect(page.getByRole("heading", { name: "Pilih makam" })).toBeVisible();
      const kartu = page
        .getByRole("radio")
        .filter({ hasText: persis(DATA.lokasiSaatDuka()) })
        .filter({ hasText: persis(DATA.jenisSaatDuka()) })
        .first();
      await kartu.click();
      await page.getByRole("button", { name: "Lanjut" }).click();
      await expect(page).toHaveURL(/\/pesan-makam\/saat-duka\/data/);
    });
    await langkah(page, "Data & kirim: Almarhum dan Pemesan, Kirim pesanan", async () => {
      await expect(page.getByText("Belum ada yang dibayar sekarang.")).toBeVisible();
      await page.getByLabel("Nama lengkap", { exact: true }).fill("Uji UAT Pemesan");
      await page.getByLabel("Nomor telepon", { exact: true }).fill(DATA.telepon());
      const email = page.getByLabel("Email", { exact: true });
      if ((await email.isEditable()) && !(await email.inputValue())) await email.fill(emailPersona("pemesan"));
      await page.getByLabel("Nama almarhum / almarhumah").fill("Almarhum Uji UAT");
      await page.getByLabel("Tanggal wafat").fill(tanggalWib(-1));
      await page.getByRole("button", { name: "Kirim pesanan" }).first().click();
      await expect(page).toHaveURL(/\/pesanan\/MKM-\d{4}-\d{6}$/, { timeout: 30_000 });
      simpan("saatduka.nomor", nomorPemesananDi(page.url()));
      await expect(page.locator("[data-slot=status-badge]")).toHaveText("Diajukan");
    });
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
      await page.getByRole("button", { name: "Konfirmasi pesanan" }).click();
      await expect(page.getByRole("button", { name: "Konfirmasi pesanan" })).toHaveCount(0, { timeout: 30_000 });
    });
  });

  test("§4 Admin Lokasi mencatat Pemakaman, keluarga membayar Tagihan, order Selesai dengan Bukti Pemesanan", async ({ sebagai }) => {
    const nomor = wajib("saatduka.nomor", "§4 Saat Duka");
    const lokasiId = wajib("saatduka.lokasiId", "§4 Saat Duka");
    const admin = await sebagai("admin-lokasi");
    await langkah(admin, "Catat Pemakaman (tanggal hari ini, lapis 1)", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
      await admin.getByLabel("Tanggal pemakaman").fill(tanggalWib(0));
      await admin.getByLabel("Lapis").fill("1");
      await admin.getByRole("button", { name: "Catat pemakaman" }).click();
      await expect(admin.getByRole("button", { name: "Catat pemakaman" })).toHaveCount(0, { timeout: 30_000 });
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
