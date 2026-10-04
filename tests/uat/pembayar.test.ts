import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { blokDescribe, fungsiPembayar, membayar, tagDiBlok } from "../../uat/support/pembayar";

/*
 * A journey that pays must carry @bayar, because `npm run uat -- --grep @bayar` is everything that has to run on
 * staging before the switch; a journey marked @tanpabayar must never pay, because those run after it. Which helper pays
 * is read from the helpers' own text (the one that presses the sandbox's "Simulate Payment", and every helper that calls
 * a paying helper), never from a list of names kept by hand (ticket 110, slice 1 follow-up).
 */

const DUKUNG = {
  "bayar.ts": `
/** Pays a Tagihan; mentions bukaTagihanDanBayar( only in this comment. */
export async function bayarDenganQris(page) {
  await page.getByRole("button", { name: /Simulate Payment/i }).click();
}
export function angkaDiHalaman(teks) { return teks; }
`,
  "alur.ts": `
export async function bukaTagihanDanBayar(page) { await bayarDenganQris(page, "/x"); return "/x"; }
export async function perpanjangDanBayar(page, halaman) { await page.goto(halaman); return bukaTagihanDanBayar(page); }
export async function pesanSaja(page) { await page.goto("/pesan"); }
`,
  "iptm.ts": `
export async function periksaLaluLunas(pemesan, admin) { await admin.goto("/a"); return perpanjangDanBayar(pemesan, "/b"); }
export async function ajukan(admin) { await admin.goto("/c"); }
`,
};

describe("which helper of the runner pays a Tagihan", () => {
  it("is the helper that presses Simulate Payment, and every helper that calls a paying helper, however deep", () => {
    expect([...fungsiPembayar(DUKUNG)].sort()).toEqual(["bayarDenganQris", "bukaTagihanDanBayar", "periksaLaluLunas", "perpanjangDanBayar"]);
  });

  it("is not guessed from a name: a helper called Bayar that never reaches the sandbox does not pay, one with any name that does, pays", () => {
    const pembayar = fungsiPembayar({
      "bayar.ts": `export async function lunasi(page) { await page.getByText("Simulate Payment").click(); }`,
      "alur.ts": `export async function bayarNanti(page) { await page.goto("/"); }\nexport async function selesaikan(page) { await lunasi(page); }`,
    });
    expect([...pembayar].sort()).toEqual(["lunasi", "selesaikan"]);
  });

  it("is not fooled by a helper that is only named in a comment", () => {
    expect(fungsiPembayar(DUKUNG).has("pesanSaja")).toBe(false);
    expect(fungsiPembayar(DUKUNG).has("ajukan")).toBe(false);
  });
});

describe("a journey's describe blocks", () => {
  const perjalanan = `
import { x } from "y";

test.describe("A [BAYAR]", { tag: ["@rilis2", "@bayar"] }, () => {
  test.describe.configure({ mode: "serial" });
  test("satu", async () => { await bukaTagihanDanBayar(page); });
});

test.describe("B", { tag: ["@rilis3", "@tanpabayar"] }, () => {
  test("dua", async () => { await page.goto("/"); });
});
`;

  it("splits at each describe and reads its tags, and `describe.configure` is not a block", () => {
    const blok = blokDescribe(perjalanan);
    expect(blok.map((satu) => satu.judul)).toEqual(["A [BAYAR]", "B"]);
    expect(blok.map((satu) => tagDiBlok(satu.badan))).toEqual([["@rilis2", "@bayar"], ["@rilis3", "@tanpabayar"]]);
  });

  it("says whether a block calls a paying helper", () => {
    const pembayar = fungsiPembayar(DUKUNG);
    expect(blokDescribe(perjalanan).map((satu) => membayar(satu.badan, pembayar))).toEqual([true, false]);
  });

  it("does not count a paying helper named in a comment", () => {
    expect(membayar(`// bukaTagihanDanBayar(page) happens in R2-35.1\n await page.goto("/")`, fungsiPembayar(DUKUNG))).toBe(false);
  });
});

describe("in the real runner: a journey that pays carries @bayar, and one marked @tanpabayar never pays", () => {
  const akar = process.cwd();
  const baca = (dir: string) =>
    Object.fromEntries(readdirSync(path.join(akar, dir)).filter((nama) => nama.endsWith(".ts")).map((nama) => [nama, readFileSync(path.join(akar, dir, nama), "utf8")]));
  const pembayar = fungsiPembayar(baca("uat/support"));

  it("finds the paying helpers by their text: the sandbox walk and the helpers built on it", () => {
    expect(pembayar.has("bayarDenganQris")).toBe(true);
    expect(pembayar.has("bukaTagihanDanBayar")).toBe(true);
    expect(pembayar.has("perpanjangDanBayar")).toBe(true);
    expect(pembayar.has("periksaDokumenLaluBayar")).toBe(true);
    expect(pembayar.has("kunjungi")).toBe(false);
  });

  const berkas = readdirSync(path.join(akar, "uat/perjalanan")).filter((nama) => nama.endsWith(".uat.ts"));
  it.each(berkas)("%s", (nama) => {
    const teks = readFileSync(path.join(akar, "uat/perjalanan", nama), "utf8");
    for (const blok of blokDescribe(teks)) {
      const tag = tagDiBlok(blok.badan);
      if (membayar(blok.badan, pembayar)) expect(tag, `${nama}: "${blok.judul}" membayar tetapi tidak bertag @bayar`).toContain("@bayar");
      if (tag.includes("@tanpabayar")) expect(membayar(blok.badan, pembayar), `${nama}: "${blok.judul}" bertag @tanpabayar tetapi membayar`).toBe(false);
    }
  });
});
