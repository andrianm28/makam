import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Gate G2 reads "every [BAYAR] item green on staging before the switch" off the
 * runner's report, so a [BAYAR] item of the two checklists with no journey that
 * runs, or a journey that only declares itself `fixme`, would let a green
 * `npm run uat -- --grep @bayar` pass for a run that never paid it (ticket 110).
 */

const AKAR = process.cwd();
const checklist23 = readFileSync(path.join(AKAR, ".scratch/makam-v1-build/uat-rilis-2-3-checklist.md"), "utf8");
const checklist1 = readFileSync(path.join(AKAR, ".scratch/makam-v1-build/uat-rilis-1-checklist.md"), "utf8");

interface Uji {
  berkas: string;
  judul: string;
  badan: string;
}

/** Every `test("…", …)` of the journeys, with the text up to the next one. */
function ujiPerjalanan(): Uji[] {
  const dir = path.join(AKAR, "uat/perjalanan");
  const hasil: Uji[] = [];
  for (const berkas of readdirSync(dir).filter((nama) => nama.endsWith(".uat.ts"))) {
    const teks = readFileSync(path.join(dir, berkas), "utf8");
    const bagian = teks.split(/\n\s*test\(/).slice(1);
    for (const badan of bagian) {
      const judul = /^\s*"([^"]+)"|^\s*`([^`]+)`/.exec(badan);
      if (judul) hasil.push({ berkas, judul: judul[1] ?? judul[2], badan });
    }
  }
  return hasil;
}

/** A journey that is declared but does not run: `test.fixme(true, …)` or `test.skip(true, …)` as its first word. */
const tidakBerjalan = (uji: Uji) => /test\.(fixme|skip)\(\s*true\b/.test(uji.badan);

describe("every [BAYAR] item of the Rilis 2 and Rilis 3 checklist has a journey that runs", () => {
  const butir = [...checklist23.matchAll(/\*\*(R[23]-\d+\.\d+) \[BAYAR\]/g)].map((cocok) => cocok[1]);
  const uji = ujiPerjalanan();

  it("finds the [BAYAR] items of the checklist (13 on 2026-10-04)", () => {
    expect(butir.length).toBeGreaterThanOrEqual(13);
  });

  it.each(butir)("%s is named by a journey, and that journey is not fixme", (id) => {
    const milik = uji.filter((satu) => satu.judul.includes(id));
    expect(milik.length, `tidak ada perjalanan yang menyebut ${id} di uat/perjalanan`).toBeGreaterThan(0);
    expect(milik.filter((satu) => !tidakBerjalan(satu)).length, `${id} hanya dideklarasikan (test.fixme), tidak berjalan`).toBeGreaterThan(0);
  });

  it("a journey title never names an item the checklist does not have", () => {
    const semua = new Set([...checklist23.matchAll(/\*\*(R[23]-\d+\.\d+)/g)].map((cocok) => cocok[1]));
    for (const satu of uji) {
      for (const id of satu.judul.match(/R[23]-\d+\.\d+/g) ?? []) {
        expect(semua.has(id), `${satu.berkas}: "${id}" tidak ada di checklist Rilis 2/3`).toBe(true);
      }
    }
  });
});

describe("every [BAYAR] item of the Rilis 1 checklist's section 11 (Layanan, family side) has a journey that runs", () => {
  const bagian11 = checklist1.split(/^## 11\. /m)[1]?.split(/^## Exit criteria/m)[0] ?? "";
  const butirBayar = bagian11.split("\n").filter((baris) => baris.startsWith("- [ ] **[BAYAR]**"));
  const uji = ujiPerjalanan().filter((satu) => satu.judul.startsWith("§11"));

  /** What each [BAYAR] item of section 11 starts with, and the journey that walks it. */
  const PETA: { butir: RegExp; perjalanan: RegExp }[] = [
    { butir: /Pesan Layanan\*\*/, perjalanan: /memesan Layanan/ },
    { butir: /Tagihan Layanan:/, perjalanan: /membayar sampai Pekerjaan Dijadwalkan/ },
    { butir: /Layanan saat checkout\*\*/, perjalanan: /Layanan saat checkout/ },
  ];

  it("has the three [BAYAR] items of 2026-10-04: order, Tagihan, Layanan at checkout", () => {
    expect(butirBayar).toHaveLength(3);
  });

  it.each(PETA.map((satu) => [String(satu.butir), satu] as const))("%s has its journey", (_nama, satu) => {
    expect(butirBayar.some((baris) => satu.butir.test(baris)), "butir tidak ada di checklist").toBe(true);
    const milik = uji.filter((uji1) => satu.perjalanan.test(uji1.judul));
    expect(milik.length, `tidak ada perjalanan §11 yang cocok ${String(satu.perjalanan)}`).toBeGreaterThan(0);
    expect(milik.filter((uji1) => !tidakBerjalan(uji1)).length).toBeGreaterThan(0);
  });

  it("covers each of the three checkout surfaces by name: Saat Duka (hari-H), Terencana (petak-kosong), Perpanjangan (Tambah Layanan)", () => {
    const judul = uji.map((satu) => satu.judul).join("\n");
    expect(judul).toMatch(/Layanan saat checkout.*Saat Duka/);
    expect(judul).toMatch(/Layanan saat checkout.*Terencana/);
    expect(judul).toMatch(/Layanan saat checkout.*Perpanjangan/);
  });
});

describe("a journey that pays carries the @bayar tag, so `--grep @bayar` is everything that must run before the switch", () => {
  const MEMBAYAR = /\b(bayarDenganQris|bukaTagihanDanBayar|perpanjangDanBayar|periksaDokumenLaluBayar)\(/;
  it.each(readdirSync(path.join(AKAR, "uat/perjalanan")).filter((nama) => nama.endsWith(".uat.ts")))("%s", (berkas) => {
    const teks = readFileSync(path.join(AKAR, "uat/perjalanan", berkas), "utf8");
    if (MEMBAYAR.test(teks)) expect(teks, `${berkas} membayar tetapi tidak bertag @bayar`).toContain('"@bayar"');
  });
});
