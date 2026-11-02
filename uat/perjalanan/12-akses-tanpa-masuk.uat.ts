import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { langkah } from "../support/langkah";
import { expect, test } from "../support/uji";

/*
 * UAT penuh, worst cases a visitor with no session can try: every staff page and
 * the Akun page send them to Masuk, a forged payment webhook is refused, the
 * development outbox and the removed TOTP page do not exist, an unknown document
 * link is a plain 404, and the baseline security headers are served. No code is
 * asked for and nothing is paid, so it runs on staging at any time.
 */

const akar = path.resolve(__dirname, "../..");
const lokal = /^http:\/\/(127\.0\.0\.1|localhost|\[::1\])/.test(process.env.UAT_BASE_URL ?? "");

/** Every staff page without a dynamic segment, read from the app's own routes so a new page is probed too. */
function halamanStaf(dir = path.join(akar, "src/app/staf"), rute = "/staf"): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const penuh = path.join(dir, nama);
    if (!statSync(penuh).isDirectory()) return nama === "page.tsx" ? [rute] : [];
    if (nama.startsWith("[") || nama.startsWith("_")) return [];
    // A route group "(x)" adds no segment.
    return halamanStaf(penuh, nama.startsWith("(") ? rute : `${rute}/${nama}`);
  });
}

test.describe("UAT penuh: akses tanpa masuk dan batas keamanan", { tag: ["@uatpenuh", "@anonim"] }, () => {
  test("UP-A1 setiap halaman staf dan Akun mengarah ke Masuk bagi pengunjung tanpa sesi", async ({ request }) => {
    const halaman = [...halamanStaf(), "/akun"];
    expect(halaman.length).toBeGreaterThan(20);
    await langkah(null, `${halaman.length} halaman: semuanya berakhir di /masuk (atau 404 rilis tertutup)`, async () => {
      const bocor: string[] = [];
      for (const rute of halaman) {
        // Follow redirects inside the staff area (/staf/mitra-jasa → its first page) until one leaves it.
        let url = rute;
        let akhir = "terlalu banyak redirect";
        for (let lompat = 0; lompat < 4; lompat++) {
          const jawaban = await request.get(url, { maxRedirects: 0 });
          const status = jawaban.status();
          if (status >= 300 && status < 400) {
            url = new URL(jawaban.headers()["location"] ?? "", "http://x").pathname;
            if (url === "/masuk") break;
            continue;
          }
          // A page with a loading.tsx streams its shell (200) and redirects inside the stream; the page body never renders.
          const isi = status === 200 ? await jawaban.text() : "";
          if (status === 200 && isi.includes("NEXT_REDIRECT;replace;/masuk;")) url = "/masuk";
          else akhir = `${status}`;
          break;
        }
        // A page of a release not open here answers 404 (the release gate); that is not a leak either.
        if (url !== "/masuk" && akhir !== "404") bocor.push(`${rute} → ${akhir} di ${url}`);
      }
      expect(bocor, "halaman staf yang terbuka tanpa masuk").toEqual([]);
    });
  });

  test("UP-A2 webhook pembayaran palsu ditolak: tanpa tanda tangan, tanda tangan salah, badan rusak", async ({ request }) => {
    await langkah(null, "Tiga webhook palsu: 4xx, tidak pernah 2xx atau 5xx", async () => {
      const kirim = (data: string, headers: Record<string, string> = {}) =>
        request.post("/api/webhooks/pembayaran", { data, headers: { "content-type": "application/json", ...headers } });
      const jawaban = [
        await kirim(JSON.stringify({ event: "payment.paid", data: { reference: "TGH/2026/000001", amount: 1 } })),
        await kirim(JSON.stringify({ event: "payment.paid" }), { "webhook-signature": "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", "webhook-id": "msg_palsu", "webhook-timestamp": "1700000000" }),
        await kirim("{ini bukan json"),
      ];
      expect(jawaban.map((j) => j.status() >= 400 && j.status() < 500)).toEqual([true, true, true]);
    });
  });

  test("UP-A3 yang tidak boleh ada: outbox development, halaman TOTP, tautan dokumen yang tidak ada", async ({ request }) => {
    if (!lokal) {
      await langkah(null, "Outbox email development 404 di staging", async () => {
        expect((await request.get("/api/dev/email-outbox?to=uji@contoh.id")).status()).toBe(404);
      });
    }
    await langkah(null, "Halaman TOTP sudah dihapus (ADR 0008): 404", async () => {
      expect((await request.get("/staf/totp", { maxRedirects: 0 })).status()).toBe(404);
    });
    await langkah(null, "Tautan Tagihan/Bukti yang tidak ada: 404, bukan galat server", async () => {
      expect((await request.get("/dokumen/tautan-yang-tidak-pernah-ada")).status()).toBe(404);
      expect((await request.get("/dokumen/tautan-yang-tidak-pernah-ada/pdf")).status()).toBe(404);
    });
  });

  test("UP-A4 header keamanan dasar terpasang di halaman publik", async ({ request }) => {
    test.skip(lokal, "header ini dipasang nginx host, bukan aplikasi");
    const jawaban = await request.get("/masuk");
    const h = jawaban.headers();
    await langkah(null, "nosniff, SAMEORIGIN, no-referrer, CSP dasar (frame-ancestors, base-uri, object-src)", async () => {
      expect(h["x-content-type-options"]).toBe("nosniff");
      expect(h["x-frame-options"]).toBe("SAMEORIGIN");
      expect(h["referrer-policy"]).toBe("no-referrer");
      expect(h["content-security-policy"] ?? "", "CSP dasar dari deploy/nginx/*.conf belum dimuat nginx host").toContain("frame-ancestors 'self'");
    });
  });

  test("UP-A5 health menyebut lingkungan non-produksi dan worker segar", async ({ request }) => {
    const jawaban = await request.get("/api/health");
    const isi = await jawaban.json();
    await langkah(null, "environment bukan production, worker fresh, database ok", async () => {
      expect(isi.environment).not.toBe("production");
      expect(isi).toMatchObject({ ok: true, database: { ok: true }, worker: { fresh: true } });
    });
  });
});
