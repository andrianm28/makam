import type { Locator, Page } from "@playwright/test";
import { DATA, envOpsional, isiDataPemesan, jpegContoh, kunjungi, lokasiIdDariNama, nomorPemesananDi, tanggalWib } from "../support/halaman";
import { baca } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Rilis 2, the [TANPA-BAYAR] items of .scratch/makam-v1-build/uat-rilis-2-3-checklist.md (slice 2): none of them
 * pays, so they may run after the switch. The records they act on are staging data named by environment variables
 * (checklist P8, uat/README.md); a journey without its record skips and says which variable to set. What only a
 * mailbox, a phone or the passing of days can show is a `manual` step, listed in the summary for a person.
 */

/** A tumpang request for `hakPakai` from the signed-in Pemesan. Returns the Nomor Pemesanan. */
async function kirimTumpang(pemesan: Page, hakPakai: string, almarhum: string): Promise<string> {
  return langkah(pemesan, `Makamkan di sini: ${almarhum}, Kirim permintaan`, async () => {
    await pemesan.goto(`/pesan-makam/makamkan-di-sini/${hakPakai}`);
    // The screen's h1 is "Makamkan di sini"; "Data & kirim" is only what the code calls it.
    await expect(pemesan.getByRole("heading", { name: "Makamkan di sini" })).toBeVisible();
    await pemesan.getByLabel("Nama almarhum / almarhumah").fill(almarhum);
    await pemesan.getByLabel("Tanggal wafat").fill(tanggalWib(-1));
    await isiDataPemesan(pemesan);
    await pemesan.getByRole("button", { name: "Kirim permintaan" }).click();
    await expect(pemesan).toHaveURL(/\/pesanan\/MKM-\d{4}-\d{6}$/, { timeout: 30_000 });
    return nomorPemesananDi(pemesan.url());
  });
}

/** The Lokasi the Rilis 2 journeys act on (Lokasi B of the checklist): the id §4 saved, or found by name. */
async function lokasiB(admin: Page): Promise<string> {
  return baca("saatduka.lokasiId") ?? (await lokasiIdDariNama(admin, DATA.lokasiSaatDuka()));
}

/**
 * The Antrean Lokasi row of one Perpanjangan request: its link is that request's review page, so the id at the end of the request's
 * own path (what `ajukanPermohonanBerkas` returns) finds it among the older rows an earlier run left open.
 */
function barisPermohonan(admin: Page, permohonan: string): Locator {
  return admin.locator(`a[href$="/perpanjangan/${permohonan.split("/").pop()}"]`);
}

/** The link of the Antrean Lokasi row captioned `label` that is about `subjek`: the caption is a line above the link, and the link names only the Petak or Kavling. */
function barisAntrean(admin: Page, label: string, subjek: string): Locator {
  return admin.locator('[data-slot="card"]').filter({ hasText: label }).filter({ hasText: subjek }).getByRole("link").first();
}

/** The Petak or Kavling a Hak Pakai request page is about ("Makam A-01"), as its Antrean row names it. */
async function unitPermintaan(pemesan: Page): Promise<string> {
  return (await pemesan.getByTestId("permintaan-petak").innerText()).replace(/^Makam\s+/, "").trim();
}

/**
 * The Pemesan's file request to extend a Hak Pakai by documents, by the path (`jalur`, as the page's `?jalur=` names it).
 * Returns the request page's path.
 */
async function ajukanPermohonanBerkas(pemesan: Page, hakPakai: string, jalur: "ktp" | "ahli_waris" | "klaim"): Promise<string> {
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

/** Admin Lokasi opens the "Periksa dokumen Perpanjangan" row of the request at `permohonan` and approves it, leaving the recorded name, phone and end date as they are. */
async function setujuiPermohonan(admin: Page, lokasiId: string, permohonan: string): Promise<void> {
  await langkah(admin, "Admin Lokasi: baris Periksa dokumen Perpanjangan, Setujui permohonan", async () => {
    await admin.goto(`/staf/admin-lokasi/${lokasiId}/antrean`);
    await expect(admin.getByText("Periksa dokumen Perpanjangan", { exact: true }).first()).toBeVisible();
    await barisPermohonan(admin, permohonan).click();
    await admin.getByTestId("setujui-permohonan").click();
    await expect(admin.getByTestId("setujui-permohonan")).toHaveCount(0, { timeout: 30_000 });
  });
}

test.describe("Rilis 2 [TANPA-BAYAR]", { tag: ["@rilis2", "@tanpabayar"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("R2-35.2 Persetujuan Pemegang Hak lewat Setujui / Tolak: Tolak mengakhiri pesanan Ditolak dengan alasan tetap", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_PEMEGANG_LAIN");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_PEMEGANG_LAIN: id Hak Pakai di Lokasi B yang Pemegang Haknya adalah akun alias Admin Lokasi, bukan Pemesan (P8e)");
    const pemesan = await sebagai("pemesan");
    const nomor = await kirimTumpang(pemesan, hakPakai!, "Almarhum Tumpang Tolak Uji UAT");
    const pemegang = await sebagai("admin-lokasi");
    await langkah(pemegang, "Pemegang Hak: permintaan di Perlu tindakan Akun Saya, buka Persetujuan pemakaman, Tolak", async () => {
      await pemegang.goto("/akun");
      await expect(pemegang.getByText("Perlu tindakan").first()).toBeVisible();
      await pemegang.goto(`/akun/persetujuan/${nomor}`);
      await expect(pemegang.getByRole("heading", { name: "Persetujuan pemakaman" })).toBeVisible();
      await pemegang.getByRole("button", { name: "Tolak" }).click();
      await expect(pemegang.getByRole("button", { name: "Tolak" })).toHaveCount(0, { timeout: 30_000 });
    });
    await langkah(pemesan, "Pemesan: pesanan Ditolak dengan alasan 'Pemegang Hak tidak menyetujui'", async () => {
      await pemesan.goto(`/pesanan/${nomor}`);
      await expect(pemesan.getByText("Ditolak").first()).toBeVisible({ timeout: 30_000 });
      await expect(pemesan.getByText(/Pemegang Hak tidak menyetujui/)).toBeVisible();
    });
    await manual(pemegang, "Email 'Setujui / Tolak' ke Pemegang Hak tiba (login dengan kode ke email tercatat dulu)", "dicek owner di mailbox alias Admin Lokasi; jalur Setujui diulang bila perlu dengan pesanan baru");
  });

  test("R2-35.3 Persetujuan lisan dan bukti ahli waris dicatat Admin Lokasi; ahli waris memunculkan pengingat Ganti Pemegang Hak", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_PEMEGANG_LAIN");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_PEMEGANG_LAIN (P8e), seperti R2-35.2");
    const nomor = await kirimTumpang(await sebagai("pemesan"), hakPakai!, "Almarhum Tumpang Lisan Uji UAT");
    const admin = await sebagai("admin-lokasi");
    const lokasiId = await lokasiB(admin);
    await langkah(admin, "Admin Lokasi: halaman pesanan, Catat persetujuan lisan dengan catatan", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/pesanan/${nomor}`);
      // "Catat persetujuan" is the legend of a fieldset (a group), not a heading.
      await expect(admin.getByRole("group", { name: "Catat persetujuan" })).toBeVisible();
      await admin.getByLabel("Catatan").first().fill("Uji UAT: Pemegang Hak menyetujui lewat telepon");
      await admin.getByRole("button", { name: "Catat persetujuan" }).click();
      // The consent line is on the page before and after, so its new words are what says it was saved. (`getByRole("alert")` always
      // finds Next's route announcer, a role=alert in a shadow root, so it can never be zero.)
      await expect(admin.getByTestId("konsen-tumpang")).toContainText("Disetujui lisan", { timeout: 30_000 });
    });
    await manual(admin, "Persetujuan dari ahli waris: berkas bukti ahli waris dicatat dan muncul pengingat Ganti Pemegang Hak", "dicoba owner pada pesanan tumpang lain dengan mode ahli waris; pengingat dibaca di panel pesanan dan di lonceng Peringatan Staf (bukan baris Antrean)");
  });

  test("R2-35.4 Pemeriksaan tumpang memblokir konfirmasi dengan alasan yang terlihat", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_TUMPANG_DIBLOKIR");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_TUMPANG_DIBLOKIR: id Hak Pakai milik persona Pemesan yang gagal pemeriksaan tumpang (lapis penuh, minimum tahun belum lewat, atau Lokasi melarang) (P8f)");
    const nomor = await kirimTumpang(await sebagai("pemesan"), hakPakai!, "Almarhum Tumpang Diblokir Uji UAT");
    const admin = await sebagai("admin-lokasi");
    await langkah(admin, "Admin Lokasi: halaman pesanan tumpang, konfirmasi terkunci", async () => {
      await admin.goto(`/staf/admin-lokasi/${await lokasiB(admin)}/pesanan/${nomor}`);
      // A card's title is a div, not a heading.
      await expect(admin.getByText("Pemakaman di Hak Pakai yang ada", { exact: true })).toBeVisible();
      const tombol = admin.getByRole("button", { name: "Konfirmasi pemakaman" });
      expect((await tombol.count()) === 0 || (await tombol.first().isDisabled()), "konfirmasi diblokir oleh pemeriksaan tumpang").toBe(true);
    });
    await manual(admin, "Alasan blokir terbaca jelas (Lokasi tak mengizinkan tumpang, minimum tahun belum lewat, atau lapis maksimum) dan banner Tagihan terdahulu belum lunas", "dibaca owner pada screenshot halaman pesanan");
  });

  test("R2-35.5 Petak dilepas tetapi belum dibongkar hanya ditawarkan sebagai tumpang, tidak sebagai petak kosong", async ({ anonim }) => {
    const petak = envOpsional("UAT_PETAK_DILEPAS");
    test.skip(!petak, "Isi UAT_PETAK_DILEPAS: nomor Petak yang dilepas tetapi belum dibongkar di Lokasi Terencana (P8d)");
    const publik = await anonim();
    await langkah(publik, "Denah Terencana: Petak dilepas tidak ditawarkan sebagai Tersedia", async () => {
      await publik.goto("/pesan-makam/terencana");
      // The whole name: the list also carries "<nama> (Contoh)" for each Lokasi.
      await publik.getByRole("link", { name: DATA.lokasiTerencana(), exact: true }).first().click();
      // The list has an h1 too, so the Denah's own h1 is what says the page changed.
      await expect(publik.getByRole("heading", { name: "Pilih petak" })).toBeVisible({ timeout: 30_000 });
      // The Denah draws one Blok at a time, so each Blok's tab is opened and the Petak looked for in all of them.
      const blok = publik.getByRole("tablist", { name: "Blok" }).getByRole("tab");
      let ditemukan = 0;
      for (let urutan = 0; urutan < (await blok.count()); urutan += 1) {
        await blok.nth(urutan).click();
        const tombol = publik.locator(`button[aria-label^="${petak}, "]`);
        ditemukan += await tombol.count();
        for (const satu of await tombol.all()) await expect(satu).not.toHaveAttribute("aria-label", /Tersedia/i);
      }
      expect(ditemukan, `Petak ${petak} ada di Denah ${DATA.lokasiTerencana()}`).toBeGreaterThan(0);
    });
    await manual(publik, "Petak dilepas ditawarkan sebagai tumpang saja (kebijakan Lokasi dan minimum tahun terpenuhi)", "dibaca owner di Makamkan di sini pada Hak Pakai Lokasi itu");
  });

  test("R2-35.6 Pembatalan hanya membatalkan pesanan dan Tagihannya; Tidak Tertagih tidak mengakhiri Hak Pakai; Pencairan jatuh tempo saat Lunas dan Pemakaman tercatat", async ({ sebagai }) => {
    const admin = await sebagai("admin-lokasi");
    await kunjungi(admin, "Antrean Lokasi: Tagihan lewat jatuh tempo", `/staf/admin-lokasi/${await lokasiB(admin)}/tagihan-lewat-jatuh-tempo`);
    await manual(admin, "Pembatalan pesanan tumpang membatalkan pesanan dan Tagihannya saja; Hak Pakai tetap berlaku", "dicek owner pada Makam Keluarga pemegang setelah membatalkan pesanan tumpang uji");
    await manual(admin, "Tagihan Tidak Tertagih tidak pernah mengakhiri Hak Pakai", "butuh 3×24 jam lewat jatuh tempo; dibaca owner pada halaman Tagihan lewat jatuh tempo");
    await manual(admin, "Pencairan Biaya Pemakaman jatuh tempo saat Lunas dan Pemakaman tercatat", "dibaca owner pada Admin Platform → Transfer setelah R2-35.1");
  });

  test("R2-39.1 Kembalikan Hak Pakai untuk petak belum terpakai: Admin Lokasi menyetujui, Hak Pakai Berakhir (alasan Pengembalian)", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_KEMBALI");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_KEMBALI: id Hak Pakai persona Pemesan atas petak belum terpakai; uji ini mengakhirinya (P8g)");
    const pemesan = await sebagai("pemesan");
    const unit = await langkah(pemesan, "Pemesan: Kembalikan Hak Pakai (peringatan kompensasi), ajukan", async () => {
      await pemesan.goto(`/permintaan-hak-pakai/${hakPakai}`);
      await expect(pemesan.getByRole("heading", { name: "Kembalikan Hak Pakai" })).toBeVisible();
      await expect(pemesan.getByText(/kompensasi/i).first()).toBeVisible();
      const petak = await unitPermintaan(pemesan);
      await pemesan.getByTestId("ajukan-pengembalian").click();
      await expect(pemesan.getByTestId("permintaan-status")).toBeVisible({ timeout: 30_000 });
      return petak;
    });
    const admin = await sebagai("admin-lokasi");
    await langkah(admin, "Admin Lokasi: baris Antrean untuk permintaan pengembalian, Setujui", async () => {
      await admin.goto(`/staf/admin-lokasi/${await lokasiB(admin)}/antrean`);
      await barisAntrean(admin, "Pengembalian Hak Pakai", unit).click();
      await admin.getByTestId("setujui-permintaan").click();
      await expect(admin.getByTestId("setujui-permintaan")).toHaveCount(0, { timeout: 30_000 });
    });
    await manual(admin, "Hak Pakai Berakhir dengan alasan Pengembalian dan Petak Tersedia lagi di Denah; baris Antrean jatuh tempo 2 hari kerja", "dibaca owner pada halaman Hak Pakai dan Denah publik (screenshot)");
  });

  test("R2-39.2 Ajukan Ganti Pemegang Hak (jual atau waris): diblokir dalam keadaan terlarang, riwayat Pemegang Hak tersimpan, Hak Pakai pindah ke tab Makam pemegang baru", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_GANTI");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_GANTI: id Hak Pakai persona Pemesan yang boleh berpindah Pemegang Hak; uji ini memindahkannya (P8h)");
    const pemesan = await sebagai("pemesan");
    const unit = await langkah(pemesan, "Pemesan: Ajukan Ganti Pemegang Hak dengan data Pemegang Hak baru", async () => {
      await pemesan.goto(`/permintaan-hak-pakai/${hakPakai}`);
      await expect(pemesan.getByRole("heading", { name: "Ajukan Ganti Pemegang Hak" })).toBeVisible();
      await pemesan.getByLabel("Nama Pemegang Hak baru").fill("Uji UAT Pemegang Baru");
      await pemesan.getByLabel("Nomor telepon Pemegang Hak baru").fill("081234500003");
      const petak = await unitPermintaan(pemesan);
      await pemesan.getByTestId("ajukan-ganti").click();
      await expect(pemesan.getByTestId("permintaan-status")).toBeVisible({ timeout: 30_000 });
      return petak;
    });
    const admin = await sebagai("admin-lokasi");
    await langkah(admin, "Admin Lokasi: buka permintaan dari Antrean, Setujui", async () => {
      await admin.goto(`/staf/admin-lokasi/${await lokasiB(admin)}/antrean`);
      await barisAntrean(admin, "Ganti Pemegang Hak", unit).click();
      await admin.getByTestId("setujui-permintaan").click();
      await expect(admin.getByTestId("setujui-permintaan")).toHaveCount(0, { timeout: 30_000 });
    });
    await manual(admin, "Riwayat Pemegang Hak tersimpan; permintaan ditolak bila ada Pembatalan terbuka atau Tagihan Saat Duka lewat jatuh tempo, jual ditolak bila Lokasi melarang, waris selalu boleh", "dicoba owner pada Hak Pakai lain untuk tiap keadaan; Hak Pakai pindah ke tab Makam pemegang baru (login alias pemegang baru)");
  });

  test("R2-39.3 Perlu Perbaikan kembali ke Diajukan, dibatalkan hanya sebelum keputusan; Admin Lokasi mengganti nomor Pemegang Hak setelah KTP dicek", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_PERBAIKAN");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_PERBAIKAN: id Hak Pakai persona Pemesan untuk permintaan yang dikirim kembali lalu ditarik (P8i)");
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-lokasi");
    const lokasiId = await lokasiB(admin);
    const unit = await langkah(pemesan, "Pemesan: Ajukan Ganti Pemegang Hak", async () => {
      await pemesan.goto(`/permintaan-hak-pakai/${hakPakai}`);
      await pemesan.getByLabel("Nama Pemegang Hak baru").fill("Uji UAT Pemegang Perbaikan");
      await pemesan.getByLabel("Nomor telepon Pemegang Hak baru").fill("081234500004");
      const petak = await unitPermintaan(pemesan);
      await pemesan.getByTestId("ajukan-ganti").click();
      await expect(pemesan.getByTestId("permintaan-status")).toBeVisible({ timeout: 30_000 });
      return petak;
    });
    await langkah(admin, "Admin Lokasi: Kirim kembali untuk diperbaiki dengan catatan keputusan", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/antrean`);
      await barisAntrean(admin, "Ganti Pemegang Hak", unit).click();
      // The field that carries the note is labelled "Yang perlu diperbaiki"; "Catatan keputusan" is only the row that shows it afterwards.
      await admin.getByLabel("Yang perlu diperbaiki").fill("Uji UAT: data Pemegang Hak baru kurang jelas");
      await admin.getByTestId("perbaikan-permintaan").click();
      await expect(admin.getByTestId("perbaikan-permintaan")).toHaveCount(0, { timeout: 30_000 });
    });
    await langkah(pemesan, "Pemesan: ajukan ulang (kembali Diajukan), lalu tarik permintaan sebelum keputusan", async () => {
      await pemesan.goto(`/permintaan-hak-pakai/${hakPakai}`);
      await pemesan.getByTestId("ajukan-ulang-permintaan").click();
      // "Tarik permintaan ini" is on the page in Perlu Perbaikan too, so the re-filing is awaited by its own form going: only Perlu Perbaikan has it.
      await expect(pemesan.getByTestId("ajukan-ulang-permintaan")).toHaveCount(0, { timeout: 30_000 });
      await expect(pemesan.getByTestId("tarik-permintaan")).toBeVisible();
      await pemesan.getByTestId("tarik-permintaan").click();
      await expect(pemesan.getByTestId("tarik-permintaan")).toHaveCount(0, { timeout: 30_000 });
    });
    await langkah(admin, "Admin Lokasi: Ubah kontak Pemegang Hak (nomor telepon baru, hasil pemeriksaan KTP, alasan)", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/hak-pakai/${hakPakai}`);
      // A card's title is a div, not a heading.
      await expect(admin.getByText("Ubah kontak Pemegang Hak", { exact: true })).toBeVisible();
      await admin.getByLabel("Nomor telepon baru").fill(DATA.telepon());
      await admin.getByLabel("Hasil pemeriksaan KTP (JPEG, PNG atau PDF)").setInputFiles(jpegContoh("ktp.jpg"));
      await admin.getByLabel("Alasan", { exact: true }).fill("Uji UAT: nomor diganti setelah KTP dicek");
      await admin.getByRole("button", { name: "Ubah kontak" }).click();
      await expect(admin.getByText("Kontak Pemegang Hak diubah")).toBeVisible({ timeout: 30_000 });
    });
    await manual(admin, "Penggantian nomor Pemegang Hak tercatat di Audit Log Lokasi; ahli waris Pemegang Hak yang wafat diarahkan ke hub Makam Keluarga", "dibaca owner pada Audit Log; arahan ahli waris dibaca pada halaman permintaan");
  });

  test("R2-39.4 Label Calon Penghuni diganti langsung tanpa tinjauan; Admin Lokasi diberi tahu tanpa baris Antrean", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_TUMPANG") ?? baca("saatduka.hakPakaiId");
    test.skip(!hakPakai, "Perlu Hak Pakai persona Pemesan: UAT_HAK_PAKAI_TUMPANG atau jalankan §4 Saat Duka");
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Pemesan: isi label Calon Penghuni di tab Makam Keluarga, tersimpan langsung", async () => {
      // The label forms are on the Makam tab, one per Petak inside the card of its Hak Pakai (found by its link), not on the request's page.
      await pemesan.goto("/akun/makam");
      const kartu = pemesan.locator("li").filter({ has: pemesan.locator(`a[href="/permintaan-hak-pakai/${hakPakai}"]`) });
      const form = kartu.getByTestId("form-calon-penghuni").first();
      await expect(form).toBeVisible();
      await form.getByRole("textbox").fill("Uji UAT Calon Penghuni");
      await form.getByRole("button", { name: "Simpan" }).click();
      // The label is an input's value, never page text: the form's own status line says it was saved.
      await expect(form.getByRole("status")).toHaveText("Calon Penghuni diubah. Lokasi Mitra diberi tahu.", { timeout: 30_000 });
    });
    const admin = await sebagai("admin-lokasi");
    await langkah(admin, "Antrean Lokasi: tidak ada baris untuk perubahan label Calon Penghuni", async () => {
      await admin.goto(`/staf/admin-lokasi/${await lokasiB(admin)}/antrean`);
      await expect(admin.getByText("Calon Penghuni")).toHaveCount(0);
    });
    await manual(admin, "Admin Lokasi menerima pemberitahuan (email atau push) tentang label Calon Penghuni baru", "dicek owner di mailbox alias Admin Lokasi");
  });

  test("R2-41.2 Perpanjangan jalur ahli waris dan jalur klaim: persetujuan mencatat Ganti Pemegang Hak atau Pemegang Hak", async ({ sebagai }) => {
    const ahliWaris = envOpsional("UAT_HAK_PAKAI_AHLI_WARIS");
    const klaim = envOpsional("UAT_HAK_PAKAI_KLAIM");
    test.skip(!ahliWaris && !klaim, "Isi UAT_HAK_PAKAI_AHLI_WARIS dan/atau UAT_HAK_PAKAI_KLAIM: id Hak Pakai tanpa email tercatat untuk jalur itu; uji ini memperbaruinya (P8c)");
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-lokasi");
    const lokasiId = await lokasiB(admin);
    for (const [hakPakai, jalur] of [[ahliWaris, "ahli_waris"], [klaim, "klaim"]] as const) {
      if (!hakPakai) continue;
      const permohonan = await ajukanPermohonanBerkas(pemesan, hakPakai, jalur);
      await setujuiPermohonan(admin, lokasiId, permohonan);
    }
    await manual(admin, "Persetujuan jalur ahli waris mencatat Ganti Pemegang Hak (riwayat tersimpan); jalur klaim mencatat Pemegang Hak", "dibaca owner pada halaman Hak Pakai dan Audit Log Lokasi");
  });

  test("R2-41.3 Perpanjangan jalur dokumen: Perlu Perbaikan, Tolak dengan alasan, Tagihan lapse tanpa unggah ulang dalam 30 hari", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_PERBAIKAN_BERKAS");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_PERBAIKAN_BERKAS: id Hak Pakai tanpa email tercatat untuk permohonan yang dikirim kembali (P8c)");
    const pemesan = await sebagai("pemesan");
    const admin = await sebagai("admin-lokasi");
    const permohonan = await ajukanPermohonanBerkas(pemesan, hakPakai!, "ktp");
    await langkah(admin, "Admin Lokasi: baris Periksa dokumen Perpanjangan terbuka, halaman permohonan", async () => {
      await admin.goto(`/staf/admin-lokasi/${await lokasiB(admin)}/antrean`);
      await expect(admin.getByText("Periksa dokumen Perpanjangan", { exact: true }).first()).toBeVisible();
      await barisPermohonan(admin, permohonan).click();
      await expect(admin.getByTestId("setujui-permohonan")).toBeVisible();
    });
    await manual(admin, "Perlu Perbaikan kembali ke Diajukan dan muncul di Perlu tindakan; Tolak dengan alasan terbaca pemohon", "dijalankan owner pada permohonan ini: Minta perbaikan, lalu pemohon mengunggah ulang, lalu Tolak");
    await manual(admin, "Tagihan lapse: Tagihan baru tanpa unggah ulang dalam 30 hari sejak persetujuan, lewat itu perlu tinjauan baru; blokir sama dengan Perpanjangan OTP", "butuh waktu; dicek owner pada minggu uji berikutnya");
  });

  test("R2-42.2 Pengingat 60/30/7 hari sebelum dan mingguan di masa tenggang; tanpa email tercatat menjadi baris Telepon Pemesan", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_MASA_TENGGANG");
    const admin = await sebagai("admin-lokasi");
    const lokasiId = await lokasiB(admin);
    if (hakPakai) {
      // "Masa berlaku" is a card's title (a div); the page's own heading is "Hak Pakai <Petak>".
      await kunjungi(admin, "Hak Pakai dalam masa tenggang: masa berlaku", `/staf/admin-lokasi/${lokasiId}/hak-pakai/${hakPakai}`, "Hak Pakai");
    }
    await kunjungi(admin, "Antrean Lokasi: baris Telepon Pemesan untuk Hak Pakai tanpa email tercatat", `/staf/admin-lokasi/${lokasiId}/antrean`);
    await manual(admin, "Pengingat 60, 30 dan 7 hari sebelum berakhir serta mingguan di masa tenggang (08:00–20:00) ke email Pemegang Hak dan Admin Lokasi, dengan tautan Perpanjangan, berhenti saat Perpanjangan dipesan", "dibaca owner di mailbox alias Pemesan dan Admin Lokasi; waktu kirim dan tautan diperiksa");
    await manual(admin, "Hak Pakai tanpa email tercatat memunculkan baris 'Telepon Pemesan' (tidak dobel)", "dibaca owner pada Antrean Lokasi untuk Hak Pakai P8c");
  });

  test("R2-42.3 Admin Lokasi mengakhiri Hak Pakai dengan alasan: Petak tetap Terisi sampai Pembongkaran dicatat lalu Tersedia", async ({ sebagai }) => {
    const hakPakai = envOpsional("UAT_HAK_PAKAI_AKHIRI");
    test.skip(!hakPakai, "Isi UAT_HAK_PAKAI_AKHIRI: id Hak Pakai di Lokasi B yang boleh diakhiri (final); uji ini mengakhirinya (P8j)");
    const admin = await sebagai("admin-lokasi");
    await langkah(admin, "Admin Lokasi: Akhiri Hak Pakai dengan alasan, Catat Pembongkaran", async () => {
      await admin.goto(`/staf/admin-lokasi/${await lokasiB(admin)}/hak-pakai/${hakPakai}`);
      // A card's title is a div, not a heading; the first match is the title, the button of the same words comes after it.
      await expect(admin.getByText("Akhiri Hak Pakai", { exact: true }).first()).toBeVisible();
      await admin.getByLabel("Alasan mengakhiri").fill("Uji UAT: Hak Pakai diakhiri oleh Admin Lokasi");
      await admin.getByRole("button", { name: "Akhiri Hak Pakai" }).click();
      const dialog = admin.getByRole("alertdialog");
      if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) await dialog.getByRole("button", { name: /Akhiri/ }).click();
      await expect(admin.getByRole("button", { name: "Catat Pembongkaran" })).toBeVisible({ timeout: 30_000 });
    });
    await manual(admin, "Petak tetap Terisi sampai Pembongkaran dicatat, lalu Tersedia; status Kedaluwarsa menampilkan Petak 'Masa Berlaku Habis'; semuanya diaudit", "dibaca owner pada Denah dan Audit Log sebelum dan sesudah Catat Pembongkaran");
  });

  test("R2-59.3 Hanya Admin Platform yang mengubah status Lokasi: Admin Lokasi tidak punya kontrolnya, perubahan diaudit dengan alasan", async ({ sebagai }) => {
    const lokasi = DATA.lokasiBerhenti();
    test.skip(!lokasi, "Isi UAT_LOKASI_BERHENTI (P9)");
    const admin = await sebagai("admin-lokasi");
    const platform = await sebagai("admin-platform");
    const lokasiId = baca("berhenti.lokasiId") ?? (await lokasiIdDariNama(await sebagai("pemesan"), lokasi!));
    await langkah(admin, "Admin Lokasi: halaman status Lokasi Admin Platform tidak memberinya Tangguhkan atau Berhenti", async () => {
      await admin.goto(`/staf/admin-platform/lokasi/${lokasiId}`);
      await expect(admin.getByRole("button", { name: "Tangguhkan", exact: true })).toHaveCount(0);
      await expect(admin.getByRole("button", { name: "Berhenti", exact: true })).toHaveCount(0);
    });
    await kunjungi(platform, "Admin Platform: Audit Log Lokasi memuat perubahan status dengan alasan", `/staf/admin-platform/lokasi/${lokasiId}/audit-log`);
    await manual(platform, "Semua pintu pesanan (Terencana, Saat Duka, Makamkan di sini, Layanan) memeriksa status; Pencairan selesai bersih; Terencana yang ditahan dilepas kecuali Pemesan di Masa Pembatalan yang membatalkan (refund)", "dicoba owner pada Lokasi uji sesudah R2-59.1; hasil dibaca di Antrean, Pencairan dan Denah");
  });

  test("R2-84.1 Pintu Masuk di Denah: Admin Lokasi menandai sel, bukan Petak dan tidak bisa dipilih, ikon dan legenda tampil di picker Terencana dan editor", async ({ sebagai, anonim }) => {
    const admin = await sebagai("admin-lokasi");
    const lokasiId = await lokasiB(admin);
    await langkah(admin, "Editor Denah: daftar Blok, buka satu Blok, legenda Pintu Masuk", async () => {
      await admin.goto(`/staf/admin-lokasi/${lokasiId}/denah`);
      await expect(admin.getByRole("heading").first()).toBeVisible();
      await admin.locator(`a[href*="/staf/admin-lokasi/${lokasiId}/denah/"]`).first().click();
      await expect(admin.getByText("Pintu Masuk").first()).toBeVisible();
    });
    const publik = await anonim();
    await langkah(publik, "Picker Terencana: legenda Pintu Masuk tampil bila Lokasi punya Pintu Masuk", async () => {
      await publik.goto("/pesan-makam/terencana");
      // The whole name: the list also carries "<nama> (Contoh)" for each Lokasi.
      await publik.getByRole("link", { name: DATA.lokasiTerencana(), exact: true }).first().click();
      // The list has an h1 too, so the Denah's own h1 is what says the page changed.
      await expect(publik.getByRole("heading", { name: "Pilih petak" })).toBeVisible({ timeout: 30_000 });
      await expect(publik.getByText("Pintu Masuk (cara masuk lokasi)")).toBeVisible();
    });
    await manual(admin, "Menandai satu sel atau banyak sel sebagai Pintu Masuk (Jadikan Pintu Masuk; editor tidak meminta alasan); sel itu tidak pernah Petak dan tidak bisa dipilih; Petak terpakai atau ditahan tidak bisa menjadi Pintu Masuk; diaudit", "dikerjakan owner di editor Denah Lokasi uji; hasil dibaca di picker Terencana dan Audit Log");
  });
});
