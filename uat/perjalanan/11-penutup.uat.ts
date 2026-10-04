import { DATA, bukaBarisAntreanLokasi, lokasiIdDariNama, persis } from "../support/halaman";
import { baca, wajib } from "../support/keadaan";
import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 10: penutup. Cancels the Terencana test order so its
 * Petak is Tersedia again. It runs after every journey that uses that grave
 * (the Layanan journey, 10-layanan), hence its place in the order.
 */

test.describe("§10 Penutup", { tag: ["@rilis1"] }, () => {
  test.describe.configure({ mode: "serial" });

  test("§10 Pemesan membatalkan order Terencana uji dan Admin Lokasi menyetujui", async ({ sebagai }) => {
    const nomor = baca("terencana.nomor");
    test.skip(!nomor, "Pesanan Terencana belum ada (jalankan §2)");
    const pemesan = await sebagai("pemesan");
    await langkah(pemesan, "Pemesan: Ajukan Pembatalan dalam Masa Pembatalan", async () => {
      // "Ajukan Pembatalan" is a link on the Hak Pakai's card in Akun Saya's Makam tab (ticket 38, spec story 102); the order page
      // only reads out a request once one exists (its "pembatalan-terencana" section holds no link).
      await pemesan.goto("/akun/makam");
      const kartu = pemesan.locator("li").filter({ hasText: persis(DATA.lokasiTerencana()) }).filter({ hasText: persis(DATA.petakTerencana()) });
      await kartu.getByTestId("tautan-pembatalan").click();
      await expect(pemesan.getByRole("heading", { name: "Pembatalan Hak Pakai" })).toBeVisible();
      await pemesan.getByTestId("ajukan-pembatalan").click();
      await expect(pemesan.getByTestId("pembatalan-status")).toBeVisible({ timeout: 30_000 });
    });
    const admin = await sebagai("admin-lokasi");
    const lokasiId = await lokasiIdDariNama(admin, DATA.lokasiTerencana());
    await bukaBarisAntreanLokasi(admin, lokasiId, "Pembatalan", nomor!);
    await langkah(admin, "Admin Lokasi: Setujui Pembatalan", async () => {
      await admin.getByTestId("setujui-pembatalan").click();
      await expect(admin.getByTestId("setujui-pembatalan")).toHaveCount(0, { timeout: 30_000 });
    });
    await manual(admin, "Admin Platform menyetujui refund; transfer dicatat; Bukti Pengembalian Dana terbit (§8)", "dikerjakan owner di Admin Platform → Pengembalian; tidak ada transfer di produksi");
  });

  test("§10 Petak kembali Tersedia di Denah publik", async ({ anonim }) => {
    test.skip(!baca("terencana.nomor"), "Pesanan Terencana belum ada (jalankan §2)");
    const page = await anonim();
    await langkah(page, "Denah publik: Petak Tersedia lagi", async () => {
      await page.goto("/pesan-makam/terencana");
      await page.getByRole("link", { name: persis(DATA.lokasiTerencana()) }).first().click();
      const petak = page.locator(`button[aria-label^="${DATA.petakTerencana()}"]`);
      await expect(petak).toBeVisible({ timeout: 30_000 });
      await expect.soft(petak).toHaveAttribute("aria-label", /Tersedia/i);
    });
    await manual(page, "Catat tanggal uji di docs/ops/runbook.md (Test payment SumoPod sandbox); centang AC tiket 61 dan 'What is NOT proved'", `Nomor Pemesanan uji ${wajib("terencana.nomor", "§2 Terencana")}`);
    await manual(page, "Simpan semua screenshot dalam satu folder dan rekap webhook (dashboard SumoPod)", "folder bukti run ini; rekap webhook dari dashboard");
  });
});
