import { describe, expect, it } from "vitest";
import { deriveKavlingStatus, derivePetakStatus } from "./status";

describe("deriving a Petak Makam's status", () => {
  it("is Tersedia with no Hak Pakai and no manual Tidak Tersedia", () => {
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: null })).toBe("tersedia");
  });

  it("is Tidak Tersedia only when manually set and there is no Hak Pakai", () => {
    expect(derivePetakStatus({ tidakTersediaReason: "Sedang direnovasi", hakPakai: null })).toBe("tidak_tersedia");
  });

  it("is Terisi under an Aktif Hak Pakai", () => {
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "aktif" } })).toBe("terisi");
  });

  it("is Masa Berlaku Habis under a Kedaluwarsa Hak Pakai (Masa Tenggang running)", () => {
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "kedaluwarsa" } })).toBe("masa_berlaku_habis");
  });

  it("is Tersedia at once when the Hak Pakai is Dibatalkan (cancelled before any Pemakaman, spec: no Pembongkaran needed)", () => {
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "dibatalkan" } })).toBe("tersedia");
  });

  it("stays Terisi after a Berakhir Hak Pakai until its Pembongkaran drops it from `forStatus`", () => {
    // `forStatus` returns null once the Petak's own Pembongkaran is recorded, so
    // the pure derivation only ever sees a Berakhir right that still holds.
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "berakhir" } })).toBe("terisi");
  });
});

describe("deriving a Kavling Keluarga's status", () => {
  it("is Tersedia with no Hak Pakai", () => {
    expect(deriveKavlingStatus({ hakPakai: null, totalPetak: 3, petakWithPemakaman: 0, petakDibongkar: 0 })).toBe("tersedia");
  });

  it("is Terpakai sebagian once some but not all member Petak have a Pemakaman", () => {
    expect(deriveKavlingStatus({ hakPakai: { status: "aktif" }, totalPetak: 3, petakWithPemakaman: 1, petakDibongkar: 0 })).toBe("terpakai_sebagian");
  });

  it("is Penuh once every member Petak has a Pemakaman", () => {
    expect(deriveKavlingStatus({ hakPakai: { status: "aktif" }, totalPetak: 3, petakWithPemakaman: 3, petakDibongkar: 0 })).toBe("penuh");
  });

  it("is Tersedia again once Dibatalkan, or Berakhir with every member Petak demolished", () => {
    expect(deriveKavlingStatus({ hakPakai: { status: "dibatalkan" }, totalPetak: 2, petakWithPemakaman: 0, petakDibongkar: 0 })).toBe("tersedia");
    expect(deriveKavlingStatus({ hakPakai: { status: "berakhir" }, totalPetak: 2, petakWithPemakaman: 2, petakDibongkar: 2 })).toBe("tersedia");
  });

  it("stays held while only some member Petak are demolished (Pembongkaran is per plot)", () => {
    expect(deriveKavlingStatus({ hakPakai: { status: "berakhir" }, totalPetak: 2, petakWithPemakaman: 2, petakDibongkar: 1 })).toBe("penuh");
  });

  it("has no manual Tidak Tersedia (unlike a Petak)", () => {
    // A Kavling under a Kedaluwarsa or not-yet-dibongkar Berakhir Hak Pakai is still "occupied" in some degree, never Tidak Tersedia.
    expect(deriveKavlingStatus({ hakPakai: { status: "kedaluwarsa" }, totalPetak: 2, petakWithPemakaman: 2, petakDibongkar: 0 })).toBe("penuh");
  });
});
