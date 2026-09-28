import { describe, expect, it } from "vitest";
import { blokOfKavling, kavlingByNomor, petakByBlok, ringkasanPilihan } from "./ringkasan";
import type { BlokView, DenahView, KavlingView, SelView } from "./tampilan";

/** A Petak cell, not part of any Kavling Keluarga. */
function petakCell(nomor: string): SelView {
  return {
    id: nomor,
    row: 0,
    col: 0,
    kind: "petak",
    nomor,
    kavling: null,
    jenisMakam: "Muslim",
    jenisMakamId: "jm-1",
    status: "bisa_dipilih",
    tumpangSaja: false,
  };
}

/** One cell of a Kavling Keluarga's outline; the Nomor Makam it carries is the Kavling's own. */
function kavlingCell(kavlingId: string, kavlingNomor: string): SelView {
  return {
    id: `${kavlingId}-cell`,
    row: 0,
    col: 0,
    kind: "petak",
    nomor: kavlingNomor,
    kavling: { id: kavlingId, nomor: kavlingNomor },
    jenisMakam: "Kavling Keluarga",
    jenisMakamId: null,
    status: "bisa_dipilih",
    tumpangSaja: false,
  };
}

function kavlingView(id: string, nomor: string, rows = 2, cols = 2): KavlingView {
  return { id, nomor, jenisMakamId: "jm-2", status: "bisa_dipilih", row: 0, col: 0, rows, cols };
}

function blok(id: string, name: string, cells: SelView[], kavling: KavlingView[] = []): BlokView {
  return { id, name, rows: 1, cols: cells.length, tersedia: cells.length, cells, kavling };
}

const blokA = blok("blok-a", "Blok A", [petakCell("A-01"), petakCell("A-02"), petakCell("A-03")]);
const blokB = blok("blok-b", "Blok B", [kavlingCell("kav-1", "KK-B1"), kavlingCell("kav-1", "KK-B1")], [
  kavlingView("kav-1", "KK-B1"),
]);

const denah: DenahView = {
  lokasi: { id: "lok-1", name: "Contoh Lokasi", city: "Kota Contoh" },
  blok: [blokA, blokB],
  tersedia: 4,
  total: { lines: [], total: 0, dalamBatas: true },
  nanti: null,
  syarat: { masaPembatalanDays: 14, refundPercent: 50, lokasiNama: "Contoh Lokasi" },
  kontakSiaga: null,
};

describe("kavlingByNomor", () => {
  it("finds the Kavling Keluarga by its Nomor Kavling, searching every Blok", () => {
    expect(kavlingByNomor(denah, "KK-B1")).toEqual(kavlingView("kav-1", "KK-B1"));
  });

  it("answers null for a Nomor Kavling the Denah does not know", () => {
    expect(kavlingByNomor(denah, "KK-ZZ")).toBeNull();
  });
});

describe("blokOfKavling", () => {
  it("finds the Blok a Kavling Keluarga belongs to, by its id", () => {
    expect(blokOfKavling(denah, "kav-1")?.name).toBe("Blok B");
  });

  it("answers null for a Kavling id the Denah does not know", () => {
    expect(blokOfKavling(denah, "kav-zz")).toBeNull();
  });
});

describe("petakByBlok", () => {
  it("groups the chosen Petak Makam by their Blok, in the Denah's own Blok order", () => {
    expect(petakByBlok(denah, ["A-02", "A-01"])).toEqual([{ blok: blokA, nomor: ["A-02", "A-01"] }]);
  });

  it("leaves out a Blok with no match, and never picks up a Kavling Keluarga's own cells", () => {
    // "KK-B1" is a Kavling Keluarga's Nomor Kavling, not a Petak's Nomor Makam: even though a cell
    // in Blok B carries that number, it belongs to a Kavling and so is never counted as a Petak.
    expect(petakByBlok(denah, ["A-01", "KK-B1"])).toEqual([{ blok: blokA, nomor: ["A-01"] }]);
  });
});

describe("ringkasanPilihan", () => {
  it("says nothing is chosen yet", () => {
    expect(ringkasanPilihan(denah, [], null)).toBe("Belum ada petak dipilih");
  });

  it("names the count and every chosen Petak, grouped by Blok", () => {
    expect(ringkasanPilihan(denah, ["A-01", "A-03"], null)).toBe("2 Petak · Blok A: A-01, A-03");
  });

  it("names a chosen Kavling Keluarga with its Blok and petak count", () => {
    expect(ringkasanPilihan(denah, [], kavlingView("kav-1", "KK-B1"))).toBe("Kavling Keluarga KK-B1 · Blok B (4 petak)");
  });
});
