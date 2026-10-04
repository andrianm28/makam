import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 7: notifikasi Admin Lokasi di semua kanal (ticket 97).
 * The Antrean row is proved by bagian 2; the bell is opened here. Email and push
 * reach the owner's own mailbox and phone, which the runner cannot see.
 */

test.describe("§7 Notifikasi Admin Lokasi", { tag: ["@rilis1"] }, () => {
  test("§7 Bell Peringatan Staf tampil di Area Staf; email, push dan retry dicek owner", async ({ sebagai }) => {
    const page = await sebagai("admin-lokasi");
    await langkah(page, "Area Staf: bell Peringatan Staf dibuka", async () => {
      await page.goto("/staf");
      const bell = page.getByRole("button", { name: /Peringatan|Notifikasi|Lonceng/i }).first();
      await expect(bell).toBeVisible();
      await bell.click();
    });
    await manual(page, "Baris Antrean muncul saat ada tugas (Konfirmasi Terencana/Saat Duka)", "terbukti oleh §2 dan §4 (baris ditemukan dan dibuka)");
    await manual(page, "Email Peringatan Staf tiba", "dicek owner di mailbox Admin Lokasi");
    await manual(page, "Push: pasang Area Staf ke Layar Utama, aktifkan notifikasi, peringatan tiba sebagai push", "hanya bisa di ponsel owner");
    await manual(page, "Kegagalan kirim di-retry worker; kanal yang sudah sukses tidak dikirim ulang; lonceng sekali", "dicek di log worker oleh orkestrator");
  });
});
