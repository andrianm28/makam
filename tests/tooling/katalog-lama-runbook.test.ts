import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { KUNCI_EKSPOR, KUNCI_HARGA_INDIKATIF, KUNCI_JENIS_MAKAM, KUNCI_LOKASI } from "@/cli/katalog-lama/ekspor";
import { bacaEkspor } from "@/cli/katalog-lama/ekspor";
import contoh from "@/cli/katalog-lama/fixtures/katalog-lama-contoh.json";

const RUNBOOK = readFileSync(join(__dirname, "../../docs/ops/runbook.md"), "utf8");

/** The one query the runbook tells the owner to run, out of its fenced SQL block. */
function sqlEkspor(): string {
  const blok = RUNBOOK.match(/```bash\n(# On the old app's own machine[\s\S]*?)\n```/);
  if (!blok) throw new Error("runbook: the export query block is gone");
  return blok[1];
}

/** Every JSON key the query writes, in reading order. */
function kunciSql(sql: string): string[] {
  return [...sql.matchAll(/'([A-Za-z]+)',/g)].map((cocok) => cocok[1]!);
}

/** The value expression the query gives a key, on that line and without its comment. */
function nilaiSql(sql: string, kunci: string): string {
  const baris = sql.split("\n").find((satu) => satu.includes(`'${kunci}',`));
  if (!baris) throw new Error(`runbook: '${kunci}' is not exported by the query`);
  const nilai = baris.slice(baris.indexOf(`'${kunci}',`) + kunci.length + 3).split("--")[0] ?? "";
  return nilai;
}

describe("the runbook's export query, held to the export contract", () => {
  it("exports every field the contract has, and nothing it has not", () => {
    // `lat` and `lng` are the pin's own object, the one nesting the contract has.
    const kontrak = new Set([
      ...KUNCI_EKSPOR,
      ...KUNCI_LOKASI,
      ...KUNCI_JENIS_MAKAM,
      ...KUNCI_HARGA_INDIKATIF,
      "lat",
      "lng",
    ]);
    const ditulis = kunciSql(sqlEkspor());

    expect([...new Set(ditulis)].sort()).toEqual([...kontrak].sort());
  });

  it("gives every fact field a source column, never a constant", () => {
    const sql = sqlEkspor();
    // The fields a person reads as a claim about the place. A constant here is the
    // defect the review found: every row would carry a fact the source never made.
    const fakta = [
      "kode",
      "nama",
      "pengelola",
      "alamat",
      "kota",
      "googleMapsUrl",
      "statusTerbit",
    ];

    for (const kunci of fakta) {
      const nilai = nilaiSql(sql, kunci);
      // A source column, and no literal anywhere in it: a `coalesce(..., '-')`
      // fallback or a hand-written value is a fact the source never claimed.
      expect(nilai, kunci).toMatch(/\b(c|p|kota)\.[a-z_]+/);
      expect(nilai, kunci).not.toContain("'");
    }
  });

  it("exports the facilities as the source's own labels, not a hand-written list", () => {
    const nilai = nilaiSql(sqlEkspor(), "fasilitas");

    expect(nilai).toContain("c.facilities");
    expect(nilai).not.toMatch(/'\s*\[/);
  });

  it("exports the source's own price ranges as indicative, and never as a price", () => {
    const sql = sqlEkspor();
    const nilai = nilaiSql(sql, "hargaIndikatif");

    // Both the cemetery-level and the package-level range, from the old app's own columns.
    expect(sql).toContain("c.price_min");
    expect(sql).toContain("p.price_min");
    expect(nilai).toContain("c.price_min");
    expect(sql).toMatch(/'hargaHakPakai', null/);
    expect(sql).toMatch(/'masaHak', null/);
    // A dash as someone's name is a fact nobody claimed.
    expect(sql).not.toMatch(/coalesce\([^)]*'-'/);
  });

  it("still refuses to touch anything but the catalog: no personal column is read", () => {
    const sql = sqlEkspor();

    for (const kolom of ["grave_records", "heir_contact_reference", "deceased_name", "email", "phone", "plot_reservations"]) {
      expect(sql).not.toContain(kolom);
    }
  });

  it("reads the example export the tool ships under the same contract, so it is a working example", () => {
    const hasil = bacaEkspor(structuredClone(contoh));

    expect(hasil).toMatchObject({ ok: true });
  });
});
