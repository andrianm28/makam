import { langkah, manual } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * Checklist Rilis 1, bagian 0: prasyarat dan akun. The Admin Platform's part of it (Pengaturan Operator) is walked in
 * 08-admin-platform.uat.ts: the first Admin Platform login must be section 1's, which types a wrong authenticator
 * code first, and a saved session would make that check skip.
 */

test.describe("§0 Prasyarat dan akun", { tag: ["@rilis1"] }, () => {
  test("§0 /api/health ok dengan worker fresh dan banner staging", async ({ request, anonim }) => {
    const publik = await anonim();
    await langkah(publik, "/api/health: ok dan worker fresh", async () => {
      const respons = await request.get("/api/health");
      expect(respons.status()).toBe(200);
      const badan = (await respons.json()) as { ok: boolean; worker: { fresh: boolean } | null };
      expect(badan.ok).toBe(true);
      expect(badan.worker?.fresh).toBe(true);
    });
    await langkah(publik, "Banner STAGING terlihat di staging", async () => {
      await publik.goto("/masuk");
      if (new URL(publik.url()).hostname === "dev.makam.co.id") {
        await expect(publik.getByRole("status").filter({ hasText: "STAGING" })).toBeVisible();
      }
    });

    await manual(null, "Akun Admin Platform siap (email + authenticator) dan Admin Lokasi memegang peran Lokasi uji", "terbukti oleh login persona; Kontak Siaga dipilih diperiksa di bagian 6");
    await manual(null, "Mailbox penerima tidak di suppression list SumoPod; cek folder spam", "hanya bisa dicek owner di mailbox dan dashboard SumoPod");
    await manual(null, 'Proyek SumoPod: "Charge fee to customer" OFF; webhook /api/webhooks/pembayaran tersimpan; Save & Test 2xx', "hanya bisa dicek owner di dashboard SumoPod");
  });
});
