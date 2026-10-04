import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { kataPencarian, polaDariTemplate } from "../../uat/support/kata-selektor";

/*
 * Every button, label, heading and test id a journey looks for was first read off the pages' source. The journeys of Rilis 1 and
 * several of Rilis 2 and 3 have since run against staging (2026-10-04 and 05); the ones that have not run yet get no other check.
 * This is the cheap proof that those words are still in the app, so a journey that waits for "Hentikan" when the page says
 * "Berhenti" fails here, in seconds, instead of stalling a staging run (ticket 110).
 */

describe("the words a journey looks for", () => {
  it("are read from the role name, label, text, alt text, test id and the option label of a journey's own helpers", () => {
    const kode = `
      await page.getByRole("button", { name: "Kirim pesanan" }).click();
      await page.getByLabel("Nama lengkap", { exact: true }).fill("x");
      await expect(page.getByText("Belum Dibayar", { exact: true })).toBeVisible();
      await page.getByTestId("setujui-pembatalan").click();
      await expect(page.getByAltText("Pratinjau bukti")).toBeVisible();
      await pilihOpsi(page, "Lokasi Mitra", { teks: "x" });
    `;
    expect(kataPencarian(kode)).toEqual([
      { jenis: "role", kata: "Kirim pesanan" },
      { jenis: "label", kata: "Nama lengkap" },
      { jenis: "text", kata: "Belum Dibayar" },
      { jenis: "testid", kata: "setujui-pembatalan" },
      { jenis: "alt", kata: "Pratinjau bukti" },
      { jenis: "opsi", kata: "Lokasi Mitra" },
    ]);
  });

  it("are read from a pattern that is plain words, each alternative on its own", () => {
    const kode = `page.getByRole("link", { name: /Buka Tagihan/ }); page.getByText(/Sudah dibayar|Dijadwalkan/); page.getByLabel(/Pemakaman/i)`;
    expect(kataPencarian(kode).map((satu) => satu.kata)).toEqual(["Buka Tagihan", "Sudah dibayar", "Dijadwalkan", "Pemakaman"]);
  });

  it("leave out a pattern with a number or a group in it, which is matched against data and not against a word of the page", () => {
    const kode = `page.getByText(/MKM-\\d{4}-\\d{6}/); page.getByRole("link", { name: /^Layanan (hari ini|akan datang)$/ }); page.getByText(/TGH\\/\\d{4}\\/\\d{6}/)`;
    expect(kataPencarian(kode)).toEqual([]);
  });

  it("leave out what is computed: a variable, a template, a helper's result", () => {
    const kode = "page.getByText(nomor); page.getByRole(\"link\", { name: persis(nomor) }); page.getByText(`Tagihan ${nomor}`); page.getByLabel(label)";
    expect(kataPencarian(kode)).toEqual([]);
  });

  it("keep an escaped quote as the quote it stands for", () => {
    expect(kataPencarian(String.raw`page.getByText("Tombol \"Masuk\" ada")`)).toEqual([{ jenis: "text", kata: 'Tombol "Masuk" ada' }]);
  });

  it("mark a word the journey asserts is NOT on the page, such as an error page's, because the app never shows it", () => {
    const kode = `await expect(page.getByRole("heading", { name: /Halaman tidak ditemukan|Application error/i })).toHaveCount(0);
      await expect(page.getByText("Lunas")).toBeVisible();`;
    expect(kataPencarian(kode)).toEqual([
      { jenis: "role", kata: "Halaman tidak ditemukan", negatif: true },
      { jenis: "role", kata: "Application error", negatif: true },
      { jenis: "text", kata: "Lunas" },
    ]);
  });

  it("include the field a locator names, so a form field that was renamed is found", () => {
    const kode = `page.locator('input[name="pemesanName"]').fill("x"); page.locator('select[name="putusan"]'); page.locator('input[id^="varian-"]')`;
    expect(kataPencarian(kode)).toEqual([
      { jenis: "field", kata: "pemesanName" },
      { jenis: "field", kata: "putusan" },
    ]);
  });
});

describe("a word the app assembles from a template literal", () => {
  const sumber = "aria-label={`Menu ${roleLabel}`} const t = `Pembayaran online (${method.channel})`; const u = `${a}${b}`; const v = `tanpa isian`;";
  const pola = polaDariTemplate(sumber);

  it("is accepted when its written-out parts are there in order", () => {
    expect(pola.some((satu) => satu.test("menu admin platform"))).toBe(true);
    expect(pola.some((satu) => satu.test("pembayaran online (qris)"))).toBe(true);
  });

  it("is not accepted for another word, and a template with no written-out part or no value in it makes no pattern", () => {
    expect(pola.some((satu) => satu.test("halaman admin platform"))).toBe(false);
    expect(pola).toHaveLength(2);
  });
});

/** What the sandbox checkout of SumoPod says: its page is the provider's, not ours, so these words are not in `src/`. */
const KATA_PENYEDIA: Record<string, string> = {
  "Simulate Payment": "tombol checkout sandbox SumoPod",
  "simulate your payment": "tautan banner Test Mode checkout sandbox SumoPod (2026-10-04)",
};

function berkasTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nama) => {
    const penuh = path.join(dir, nama);
    if (statSync(penuh).isDirectory()) return berkasTs(penuh);
    return /\.tsx?$/.test(nama) && !/\.test\.tsx?$/.test(nama) ? [penuh] : [];
  });
}

describe("the words of every journey and helper are still in the app", () => {
  const akar = process.cwd();
  const aplikasi = berkasTs(path.join(akar, "src")).map((berkas) => readFileSync(berkas, "utf8")).join("\n").toLowerCase();
  const polaTemplate = polaDariTemplate(berkasTs(path.join(akar, "src")).map((berkas) => readFileSync(berkas, "utf8")).join("\n"));
  /** The two modules that analyse the runner itself: their own regular expressions are not words of a page. */
  const ALAT = new Set(["kata-selektor.ts", "pembayar.ts"]);
  const berkasRunner = [...berkasTs(path.join(akar, "uat/perjalanan")), ...berkasTs(path.join(akar, "uat/support"))].filter((berkas) => !ALAT.has(path.basename(berkas)));
  /** What the runner types into forms (`.fill("…")`): a journey that then looks for it is looking for its own data. */
  const diketik = berkasRunner.flatMap((berkas) => [...readFileSync(berkas, "utf8").matchAll(/\.fill\("((?:[^"\\]|\\.)+)"\)/g)].map((cocok) => cocok[1].toLowerCase())).filter((teks) => teks.length >= 6);
  const ada = (kata: string) => aplikasi.includes(kata.toLowerCase()) || polaTemplate.some((pola) => pola.test(kata.toLowerCase()));

  it("reads the runner's files (a guard that finds nothing guards nothing)", () => {
    expect(berkasRunner.length).toBeGreaterThanOrEqual(25);
    const semua = berkasRunner.flatMap((berkas) => kataPencarian(readFileSync(berkas, "utf8")));
    expect(semua.length).toBeGreaterThan(150);
  });

  it.each(berkasRunner.map((berkas) => [path.relative(akar, berkas), berkas] as const))("%s", (_nama, berkas) => {
    const hilang = kataPencarian(readFileSync(berkas, "utf8")).filter(({ jenis, kata, negatif }) => {
      // Not words of the app: what the provider's checkout says, what a page must not show, and what the journeys type themselves ("… uji UAT …" in the values they enter, or any `.fill("…")` text).
      if (KATA_PENYEDIA[kata] || negatif || /uji uat/i.test(kata) || diketik.some((teks) => kata.toLowerCase().includes(teks))) return false;
      return jenis === "field" ? !aplikasi.includes(`name="${kata.toLowerCase()}"`) : !ada(kata);
    });
    expect(hilang.map(({ jenis, kata }) => `${jenis}: ${kata}`), "kata yang dicari perjalanan tetapi tidak ada di src/").toEqual([]);
  });
});
