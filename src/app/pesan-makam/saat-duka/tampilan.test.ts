import { describe, expect, it } from "vitest";
import { agamaLabel, perKota, saringAgama } from "./tampilan";

/** The Pilih makam grid (rapat Ira, 6 Nov 2026; dri chose the agama filter over the city filter). */
describe("the agama a Lokasi Mitra card names", () => {
  it("is 'Lintas agama' for a Lokasi Mitra that accepts all six", () => {
    expect(agamaLabel(["konghucu", "islam", "kristen", "katolik", "hindu", "buddha"])).toBe("Lintas agama");
  });

  it("names the agama in the list's own order otherwise, and nothing when none is recorded", () => {
    expect(agamaLabel(["buddha", "kristen"])).toBe("Kristen, Buddha");
    expect(agamaLabel([])).toBe("");
  });
});

describe("the agama filter on Pilih makam", () => {
  const grup = [
    { nama: "Graha Sentosa", agama: ["kristen", "katolik", "buddha"] as const },
    { nama: "Al-Azhar", agama: ["islam"] as const },
    { nama: "Belum diisi", agama: [] as const },
  ].map((satu) => ({ ...satu, agama: [...satu.agama] }));

  it("keeps every Lokasi Mitra under Semua agama", () => {
    expect(saringAgama(grup, "semua").map((satu) => satu.nama)).toEqual(["Graha Sentosa", "Al-Azhar", "Belum diisi"]);
  });

  it("keeps only the Lokasi Mitra that accept the chosen agama, never one with none recorded", () => {
    expect(saringAgama(grup, "islam").map((satu) => satu.nama)).toEqual(["Al-Azhar"]);
    expect(saringAgama(grup, "katolik").map((satu) => satu.nama)).toEqual(["Graha Sentosa"]);
  });
});

describe("the city headings of the Pilih makam grid", () => {
  it("groups the cheapest-first list by city, each city where its cheapest Lokasi Mitra first appears", () => {
    const grup = [
      { nama: "A", kota: "Bogor" },
      { nama: "B", kota: "Karawang" },
      { nama: "C", kota: "Bogor" },
    ];
    expect(perKota(grup).map((kelompok) => [kelompok.kota, kelompok.grup.map((satu) => satu.nama)])).toEqual([
      ["Bogor", ["A", "C"]],
      ["Karawang", ["B"]],
    ]);
  });
});
