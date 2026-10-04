import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The runner refuses a stack that does not say it is development, test or staging, before any journey
 * (uat/support/pra-uji.ts). The person who sees "UAT ditolak" reads the README to learn why, so it says so.
 */

const readme = readFileSync(path.join(process.cwd(), "uat/README.md"), "utf8");

describe("the UAT README explains the refusal before any journey", () => {
  it("says the stack at the base URL is asked on /api/health which environment it is", () => {
    expect(readme).toContain("/api/health");
    expect(readme).toMatch(/environment/i);
  });

  it("says only development, test and staging pass", () => {
    for (const nama of ["development", "test", "staging"]) expect(readme, `README tidak menyebut ${nama}`).toContain(nama);
  });

  it("says a stack that answers production is refused, also on a loopback port of the production host", () => {
    expect(readme).toMatch(/production/);
    expect(readme).toMatch(/127\.0\.0\.1:3100|loopback|port lokal/i);
  });

  it("says no answer, an unreadable answer or an unknown environment is refused as well (it fails closed)", () => {
    expect(readme).toMatch(/tidak menjawab|tanpa jawaban|no answer/i);
    expect(readme).toMatch(/tidak dikenal|unknown/i);
  });

  it("says what the refusal looks like, so it can be recognised", () => {
    expect(readme).toContain("UAT ditolak");
  });
});

/** Every `UAT_…` name the runner's own files mention (journeys, helpers, configuration). */
function variabelRunner(): string[] {
  const berkas = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((isi) => (isi.isDirectory() ? berkas(path.join(dir, isi.name)) : isi.name.endsWith(".ts") ? [path.join(dir, isi.name)] : []));
  const nama = berkas(path.join(process.cwd(), "uat")).flatMap((satu) => [...readFileSync(satu, "utf8").matchAll(/UAT_[A-Z0-9_]+/g)].map((cocok) => cocok[0]));
  return [...new Set(nama)].sort();
}

/** The families the table lists by their first name and then the suffixes alone (`UAT_HAK_PAKAI_TUMPANG`, `_TANPA_EMAIL`). */
const KELUARGA_SINGKAT = ["UAT_HAK_PAKAI_", "UAT_EMAIL_"];

describe("the UAT README names what a person needs to start the journeys", () => {
  it("lists every UAT_ variable the runner reads, a family of records by its first name and then its suffixes", () => {
    const semua = variabelRunner();
    expect(semua.length, "a guard that finds nothing guards nothing").toBeGreaterThan(30);
    const hilang = semua.filter((nama) => {
      const keluarga = KELUARGA_SINGKAT.find((awal) => nama.startsWith(awal));
      return !readme.includes(nama) && !(keluarga && readme.includes(`\`_${nama.slice(keluarga.length)}\``));
    });
    expect(hilang, "variabel yang dibaca runner tetapi tidak ada di tabel Environment uat/README.md").toEqual([]);
  });

  it("says §5 run signed in as the recorded holder never exercises the OTP, so the OTP is checked separately, signed out", () => {
    expect(readme).toMatch(/never exercises the OTP/);
    expect(readme).toMatch(/signed out/);
    expect(readme).toContain("ajukan.ts");
  });

  it("says which journeys have already run against staging (2026-10-04 and 05) instead of claiming none has", () => {
    expect(readme).toContain("2026-10-04");
  });
});
