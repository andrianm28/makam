import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PETAK_TERSEDIA } from "../../uat/support/halaman";

/*
 * What a journey says about a Petak, a Lokasi or a request it finds by words on staging's pages. Staging carries a
 * "<nama> (Contoh)" copy of each Lokasi (Data Contoh, tickets 109 and 111), the Denah words a Petak that cannot be picked
 * "Tidak Tersedia", which holds the word "Tersedia", and the module refuses an approval of a Perpanjangan request that
 * names no reason. A journey cannot be run here, so the cheap proof is read off the journeys' own text.
 */

describe("a Petak on the Denah is Tersedia", () => {
  it("when its button says so, as the Denah words it", () => {
    expect(PETAK_TERSEDIA.test("A-01, Makam Biasa, Tersedia")).toBe(true);
    expect(PETAK_TERSEDIA.test("A-01, Makam 10 tahun, tersedia")).toBe(true);
  });

  it("is not when the button says Tidak Tersedia, which holds the word too", () => {
    expect(PETAK_TERSEDIA.test("A-01, Makam Biasa, Tidak Tersedia")).toBe(false);
    expect(PETAK_TERSEDIA.test("A-01, Makam Biasa, tidak tersedia")).toBe(false);
  });

  it("is not when the Petak is Dipesan, Terisi, Perlu Verifikasi, Masa Berlaku Habis, chosen, or cannot be picked", () => {
    for (const status of ["Dipesan", "Terisi", "Perlu Verifikasi", "Masa Berlaku Habis", "dipilih", "tidak bisa dipilih"]) {
      expect(PETAK_TERSEDIA.test(`A-01, Makam Biasa, ${status}`), status).toBe(false);
    }
  });
});

const akar = process.cwd();
const berkasRunner = [
  ...readdirSync(path.join(akar, "uat/perjalanan")).filter((nama) => nama.endsWith(".uat.ts")).map((nama) => path.join("uat/perjalanan", nama)),
  ...readdirSync(path.join(akar, "uat/support")).filter((nama) => nama.endsWith(".ts")).map((nama) => path.join("uat/support", nama)),
];

describe("the words of a journey that must be exact", () => {
  it("reads the runner's files (a guard that finds nothing guards nothing)", () => {
    expect(berkasRunner.length).toBeGreaterThanOrEqual(25);
  });

  it.each(berkasRunner)("%s asks a Petak's status through PETAK_TERSEDIA, never by /Tersedia/i alone, which Tidak Tersedia also satisfies", (berkas) => {
    expect(readFileSync(path.join(akar, berkas), "utf8")).not.toMatch(/\/Tersedia\/[a-z]*/);
  });

  it.each(berkasRunner)("%s finds a Lokasi by its whole name, never by a piece of it that '<nama> (Contoh)' also holds", (berkas) => {
    expect(readFileSync(path.join(akar, berkas), "utf8")).not.toMatch(/persis\(\s*(?:DATA\.lokasi\w*\(\)|lokasi!?)\s*\)/);
  });

  it.each(berkasRunner)("%s names a reason wherever it approves a Perpanjangan request (the module refuses an approval without one)", (berkas) => {
    const teks = readFileSync(path.join(akar, berkas), "utf8");
    if (!/getByTestId\("setujui-permohonan"\)\.click\(\)/.test(teks)) return;
    expect(teks).toContain('getByLabel("Alasan (dicatat di Audit Log)")');
  });
});
