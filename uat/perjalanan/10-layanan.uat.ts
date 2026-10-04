import { bukaDataSaatDuka, perpanjangDanBayar } from "../support/alur";
import { angkaDiHalaman, bayarDenganQris } from "../support/bayar";
import { DATA, ambilSemuaBuktiKamera, bukaBarisAntreanLokasi, envOpsional, isiDataPemesan, lokasiIdDariNama, nomorPemesananDi, pilihLayananCheckout, pilihOpsi, tanggalWib } from "../support/halaman";
import { simpan, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 11: Layanan dari sisi keluarga di Lokasi Mitra (ADR
 * 0006): order and pay [BAYAR], fulfilment with the browser camera, Keluhan,
 * Penilaian and the message thread. It uses the Terencana grave of bagian 3, so it
 * runs before the closing journey (11-penutup) that cancels that order.
 */

test.describe("§11 Layanan dari sisi keluarga", { tag: ["@rilis1", "@bayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("§11 Pemesan memesan Layanan lewat Makam Keluarga dan membayar sampai Pekerjaan Dijadwalkan", async ({ sebagai }) => {
    const page = await sebagai("pemesan");
    await langkah(page, "Makam Keluarga: cari Nomor Makam di Lokasi Mitra", async () => {
      // The menu's "Layanan" opens the hub with the Layanan branch chosen: only then does a found Petak offer "Pesan layanan di Petak …" (the "Layanan Makam" card goes to /layanan, which names no Petak).
      await page.goto("/makam-keluarga?aksi=layanan");
      // The options read "<nama> — <kota>"; with the " — " the name is matched whole, so "<nama> (Contoh)" is not taken for it.
      await pilihOpsi(page, "Lokasi Mitra", { teks: `${DATA.lokasiTerencana()} — ` });
      // The radio "Nomor Makam" carries the same label as the field, so the field is found by its role.
      await page.getByRole("textbox", { name: "Nomor Makam" }).fill(DATA.petakTerencana());
      await page.getByRole("button", { name: "Cari makam" }).click();
      // The found grave's card reads "Petak Makam · <nomor>"; the bare words are also in the "Perpanjang Makam" tile, which is there with no result at all.
      await expect(page.getByText(`Petak Makam · ${DATA.petakTerencana()}`)).toBeVisible();
    });
    await langkah(page, "Layanan Makam: pilih varian dan tanggal target", async () => {
      await page.getByRole("link", { name: /Pesan layanan di Petak/ }).first().click();
      await expect(page.getByRole("heading", { name: "Pesan Layanan Makam" })).toBeVisible();
      const varian = page.locator('select[id^="varian-"]').first();
      await varian.selectOption({ index: 1 });
      await expect(page.getByTestId("harga-total")).toBeVisible();
      const teks = page.locator('textarea[id^="teks-"]').first();
      if (await teks.isVisible()) await teks.fill("Teks contoh uji UAT");
    });
    await langkah(page, "Pesan layanan: Nomor Pesanan dan Tagihan", async () => {
      await page.getByLabel("Nama lengkap Anda").fill("Uji UAT Pemesan");
      await page.getByLabel("Nomor telepon", { exact: true }).fill(DATA.telepon());
      await page.getByRole("button", { name: "Pesan layanan" }).click();
      await expect(page).toHaveURL(/\/layanan\/[A-Za-z0-9-]+$/, { timeout: 30_000 });
      await expect(page.getByRole("heading", { name: "Layanan dipesan" })).toBeVisible();
      simpan("layanan.nomor", new URL(page.url()).pathname.split("/").pop()!);
      await expect.soft(page.getByText(/TGH\/\d{4}\/\d{6}/).first()).toBeVisible();
      await page.getByRole("link", { name: "Buka Tagihan" }).click();
      await expect(page).toHaveURL(/\/dokumen\//);
      simpan("layanan.tagihanUrl", new URL(page.url()).pathname);
    });
    await bayarDenganQris(page, wajib("layanan.tagihanUrl", "§11 Layanan"));
    await langkah(page, "Pekerjaan Layanan Dijadwalkan; halaman pesanan: Sudah dibayar", async () => {
      await page.goto(`/layanan/${wajib("layanan.nomor", "§11 Layanan")}`);
      await expect(page.getByText(/Sudah dibayar/).first()).toBeVisible();
    });
  });

  test("§11 Admin Lokasi mengerjakan: bukti dari kamera aplikasi lalu Tandai selesai", async ({ sebagai }) => {
    const nomor = wajib("layanan.nomor", "§11 Layanan");
    const page = await sebagai("admin-lokasi");
    const lokasiId = await lokasiIdDariNama(page, DATA.lokasiTerencana());
    // A Layanan row names the Layanan and the Petak ("<Layanan – nama (varian)> · Petak A-01"), never the Nomor Pemesanan.
    await bukaBarisAntreanLokasi(page, lokasiId, /^Layanan (hari ini|akan datang)$/, `Petak ${DATA.petakTerencana()}`);
    await langkah(page, "Mulai kerjakan, ambil bukti dengan kamera, Tandai selesai", async () => {
      // The job page names the Nomor Pesanan: an older open job on the same Petak stops the journey here instead of being worked.
      await expect(page.getByText(nomor, { exact: true })).toBeVisible();
      const mulai = page.getByRole("button", { name: "Mulai kerjakan" });
      if (await mulai.isVisible()) await mulai.click();
      await ambilSemuaBuktiKamera(page);
      await page.getByRole("button", { name: "Tandai selesai" }).click();
      await expect(page.getByRole("button", { name: "Tandai selesai" })).toHaveCount(0, { timeout: 30_000 });
    });
  });

  test("§11 Pemesan: bukti tampil, thread pesan, Penilaian dan Keluhan dalam jendela 3×24 jam", async ({ sebagai }) => {
    const nomor = wajib("layanan.nomor", "§11 Layanan");
    const page = await sebagai("pemesan");
    await langkah(page, "Halaman Layanan: bukti pekerjaan tampil", async () => {
      await page.goto(`/layanan/${nomor}`);
      await expect(page.getByText(/Selesai/).first()).toBeVisible();
    });
    await langkah(page, "Thread pesan: kirim pesan teks", async () => {
      await page.getByLabel("Tulis pesan").first().fill("Pesan uji UAT dari Pemesan.");
      await page.getByRole("button", { name: "Kirim pesan" }).first().click();
      await expect(page.getByText("Pesan uji UAT dari Pemesan.").first()).toBeVisible({ timeout: 30_000 });
    });
    await langkah(page, "Penilaian 5 bintang dengan komentar", async () => {
      await page.getByLabel("5 bintang").first().check();
      await page.getByLabel("Komentar").first().fill("Penilaian uji UAT.");
      await page.getByRole("button", { name: "Kirim penilaian" }).first().click();
      await expect(page.getByText("Terima kasih, Anda sudah menilai pekerjaan ini.")).toBeVisible({ timeout: 30_000 });
    });
    await langkah(page, "Keluhan: ajukan dalam jendela, muncul sebagai baris untuk Admin Platform", async () => {
      await page.getByLabel("Ada yang belum sesuai?").first().fill("Keluhan uji UAT: mohon diperiksa.");
      await page.getByRole("button", { name: "Ajukan keluhan" }).first().click();
      // The filed Keluhan reads "Keluhan: Menunggu keputusan" and the form goes; /keluhan/i is also in the form's own label and button.
      await expect.soft(page.getByText("Menunggu keputusan")).toBeVisible();
    });
    await manual(page, "Email pesan baru ke Pemesan tanpa isi pesan, dengan tautan balas", "dicek owner di mailbox");
    await manual(page, "Penilaian hanya terbaca Admin Platform (tidak Admin Lokasi, tidak Mitra Jasa)", "Admin Platform membuka daftar Penilaian; Admin Lokasi tidak menemukannya");
    await manual(page, "Keluhan: baris 'Keluhan' (Tier 1) muncul di Antrean Admin Platform dan keputusan (tolak, kerjakan ulang, refund) tersedia", "dibuka owner di Antrean Admin Platform; runner tidak memegang keputusan");
    await manual(page, "Admin Lokasi membalas di thread pekerjaan dan Pemesan menerima pesan tanpa isi di email", "dicek owner; thread Admin Lokasi sama dengan thread Pemesan");
    await manual(page, "Layanan Terlambat (target + 2 hari tanpa bukti) muncul sebagai baris 'Layanan terlambat' di Antrean Lokasi", "butuh dua hari lewat; dicek di minggu uji berikutnya");
    await manual(page, "Thread menjadi baca-saja saat jendela Keluhan tutup; batal sebelum H-1 menahan Biaya Layanan Platform", "butuh waktu 3×24 jam atau pesanan baru; dicek di minggu uji berikutnya");
  });

  /*
   * Layanan saat checkout (tiket 53), the three places a booking offers it. (c) pays, as the checklist asks
   * ("bayar salah satunya sampai Lunas"). (a) and (b) send the order, have the Admin Lokasi confirm it and read the
   * Tagihan that results, without paying it: the row of the chosen Layanan is in it, and it is the kind the checklist names
   * (bayar-belakang for Saat Duka, bayar-dulu for Terencana). An unpaid order lapses by itself (Saat Duka's Tagihan 3×24 h
   * after the burial, Terencana's after 24 h, which frees the Petak again).
   */
  test("§11 Layanan saat checkout (a) Saat Duka: hanya item hari-H ditawarkan, barisnya masuk Tagihan bayar-belakang yang sama", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    let pilihan = { nama: "", harga: "" };
    const nomor = await langkah(pemesan, "Saat Duka, Data & kirim: isi data, pilih Layanan hari-H, Kirim pesanan", async () => {
      await bukaDataSaatDuka(pemesan);
      await isiDataPemesan(pemesan);
      await pemesan.getByLabel("Nama almarhum / almarhumah").fill("Almarhum Layanan Checkout Uji UAT");
      await pemesan.getByLabel("Tanggal wafat").fill(tanggalWib(-1));
      pilihan = await pilihLayananCheckout(pemesan, "hari-h");
      await expect.soft(pemesan.getByText(/Layanan hari-H/).first()).toBeVisible();
      await pemesan.getByRole("button", { name: "Kirim pesanan" }).first().click();
      await expect(pemesan).toHaveURL(/\/pesanan\/MKM-\d{4}-\d{6}$/, { timeout: 30_000 });
      return nomorPemesananDi(pemesan.url());
    });
    const admin = await sebagai("admin-lokasi");
    await bukaBarisAntreanLokasi(admin, await lokasiIdDariNama(admin, DATA.lokasiSaatDuka()), "Konfirmasi Saat Duka", nomor);
    await langkah(admin, "Admin Lokasi: konfirmasi pesanan (Petak Makam dan waktu pemakaman), Tagihan terbit", async () => {
      await pilihOpsi(admin, "Petak Makam");
      await admin.getByLabel("Pemakaman", { exact: true }).fill(`${tanggalWib(1)}T10:00`);
      await admin.getByRole("button", { name: "Konfirmasi pesanan" }).click();
      await expect(admin.getByRole("button", { name: "Konfirmasi pesanan" })).toHaveCount(0, { timeout: 30_000 });
    });
    await langkah(pemesan, "Tagihan: bayar-belakang (dibayar setelah pemakaman) dan memuat baris Layanan hari-H", async () => {
      await pemesan.goto(`/pesanan/${nomor}`);
      await pemesan.getByRole("link", { name: /TGH\/\d{4}\/\d{6}/ }).first().click();
      await expect(pemesan).toHaveURL(/\/dokumen\//);
      await expect(pemesan.getByText("Tagihan ini dibayar setelah pemakaman.")).toBeVisible();
      expect(angkaDiHalaman(await pemesan.locator("body").innerText()), `baris Layanan "${pilihan.nama}" (${pilihan.harga}) ada di Tagihan`).toContain(pilihan.harga);
    });
  });

  test("§11 Layanan saat checkout (b) Terencana: untuk satu petak hanya item petak-kosong, Tagihan bayar-dulu memuat barisnya dan jatuh tempo", async ({ sebagai }) => {
    const pemesan = await sebagai("pemesan");
    const petak = pemesan.locator(`button[aria-label^="${DATA.petakTerencanaLayanan()}"]`);
    let pilihan = { nama: "", harga: "" };
    const nomor = await langkah(pemesan, "Terencana: pilih satu Petak, Data & kirim: pilih Layanan petak-kosong, Kirim pesanan", async () => {
      await pemesan.goto("/pesan-makam/terencana");
      // The card's link is the Lokasi's name alone: exact, so the "<nama> (Contoh)" card is not the one clicked.
      await pemesan.getByRole("link", { name: DATA.lokasiTerencana(), exact: true }).first().click();
      await petak.click();
      await pemesan.getByRole("button", { name: "Lanjut" }).click();
      await expect(pemesan.getByRole("heading", { name: "Data & kirim" })).toBeVisible();
      await isiDataPemesan(pemesan);
      pilihan = await pilihLayananCheckout(pemesan, "petak-kosong");
      await expect(pemesan.getByTestId("total-layanan")).toContainText("Rp");
      await pemesan.getByRole("button", { name: /Kirim pesanan/ }).first().click();
      await expect(pemesan.getByRole("heading", { name: "Pesanan terkirim" })).toBeVisible({ timeout: 30_000 });
      const tautan = (await pemesan.getByRole("link", { name: "Ikuti pesanan" }).getAttribute("href")) ?? "";
      return nomorPemesananDi(tautan || (await pemesan.locator("main").innerText()));
    });
    const admin = await sebagai("admin-lokasi");
    await bukaBarisAntreanLokasi(admin, await lokasiIdDariNama(admin, DATA.lokasiTerencana()), "Konfirmasi Terencana", nomor);
    await langkah(admin, "Admin Lokasi: konfirmasi pesanan Terencana, Tagihan bayar-dulu terbit", async () => {
      await admin.getByTestId("konfirmasi-terencana").click();
      await expect(admin.getByTestId("konfirmasi-terencana")).toHaveCount(0, { timeout: 30_000 });
    });
    await langkah(pemesan, "Tagihan: bayar-dulu (sebelum jatuh tempo), memuat baris Layanan petak-kosong", async () => {
      await pemesan.goto(`/pesanan/${nomor}`);
      await pemesan.getByTestId("bayar-terencana").click();
      await expect(pemesan).toHaveURL(/\/dokumen\//);
      await expect(pemesan.getByText("Jatuh tempo").first()).toBeVisible();
      await expect(pemesan.getByText(/Mohon dibayar sebelum jatuh tempo/)).toBeVisible();
      expect(angkaDiHalaman(await pemesan.locator("body").innerText()), `baris Layanan "${pilihan.nama}" (${pilihan.harga}) ada di Tagihan`).toContain(pilihan.harga);
    });
    await manual(pemesan, "Terencana: jatuh tempo Tagihan adalah yang paling awal dari Petak dan Layanan (24 jam)", "dibaca owner pada Tagihan: Tanggal terbit dan Jatuh tempo (screenshot); Tagihan tidak dibayar dan lapse sendiri, Petak lepas lagi");
  });

  test("§11 Layanan saat checkout (c) Perpanjangan: Tambah Layanan di Tagihan Perpanjangan, satu Biaya Layanan Platform, bayar sampai Lunas", async ({ sebagai }) => {
    // A Perpanjangan offers its terms and "Tambah Layanan" only from 3 months before the end date to the end of the Masa Tenggang, so the
    // 10-year Hak Pakai of §4 answers "bisa diperpanjang mulai <tanggal>" and has nothing to click (see §5): a record inside the window, used up here.
    const hakPakai = envOpsional("UAT_HAK_PAKAI_PERPANJANGAN_LAYANAN");
    test.skip(
      !hakPakai,
      "Isi UAT_HAK_PAKAI_PERPANJANGAN_LAYANAN: id Hak Pakai berjangka milik persona Pemesan yang Perpanjangannya sedang terbuka (tanggal akhir paling lama 3 bulan lagi, atau lewat dalam masa tenggang), selain yang dipakai §5. Hak Pakai 10 tahun dari bagian 4 baru bisa diperpanjang 3 bulan sebelum berakhir.",
    );
    const page = await sebagai("pemesan");
    const tagihanUrl = await perpanjangDanBayar(page, `/perpanjangan/${hakPakai}`, { tambahLayanan: true });
    await langkah(page, "Tagihan Perpanjangan: baris Layanan dan satu Biaya Layanan Platform", async () => {
      await page.goto(tagihanUrl);
      await expect.soft(page.getByText("Biaya Layanan Platform")).toHaveCount(1);
      // A Layanan line reads "Layanan – <nama> (<varian>)"; /Layanan/ alone is also in "Biaya Layanan Platform".
      await expect.soft(page.getByText(/Layanan – /).first()).toBeVisible();
    });
    await manual(page, "Perpanjangan: jatuh tempo tetap 3×24 jam dan tanggal target Layanan paling cepat lead time setelah jatuh tempo itu", "dibaca owner pada Tagihan dan halaman pesanan Layanan (screenshot)");
  });
});
