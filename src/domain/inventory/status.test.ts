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
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "aktif", pembongkaranAt: null } })).toBe("terisi");
  });

  it("is Masa Berlaku Habis under a Kedaluwarsa Hak Pakai (Masa Tenggang running)", () => {
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "kedaluwarsa", pembongkaranAt: null } })).toBe("masa_berlaku_habis");
  });

  it("is Tersedia at once when the Hak Pakai is Dibatalkan (cancelled before any Pemakaman, spec: no Pembongkaran needed)", () => {
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "dibatalkan", pembongkaranAt: null } })).toBe("tersedia");
  });

  it("stays Terisi after a Berakhir Hak Pakai until a Pembongkaran is recorded", () => {
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "berakhir", pembongkaranAt: null } })).toBe("terisi");
  });

  it("becomes Tersedia again once the Pembongkaran after a Berakhir Hak Pakai is recorded", () => {
    expect(derivePetakStatus({ tidakTersediaReason: null, hakPakai: { status: "berakhir", pembongkaranAt: new Date("2026-11-01T00:00:00+07:00") } })).toBe("tersedia");
  });
});

describe("deriving a Kavling Keluarga's status", () => {
  it("is Tersedia with no Hak Pakai", () => {
    expect(deriveKavlingStatus({ hakPakai: null, totalPetak: 3, petakWithPemakaman: 0 })).toBe("tersedia");
  });

  it("is Terpakai sebagian once some but not all member Petak have a Pemakaman", () => {
    expect(deriveKavlingStatus({ hakPakai: { status: "aktif", pembongkaranAt: null }, totalPetak: 3, petakWithPemakaman: 1 })).toBe("terpakai_sebagian");
  });

  it("is Penuh once every member Petak has a Pemakaman", () => {
    expect(deriveKavlingStatus({ hakPakai: { status: "aktif", pembongkaranAt: null }, totalPetak: 3, petakWithPemakaman: 3 })).toBe("penuh");
  });

  it("is Tersedia again once Dibatalkan, or Berakhir with its Pembongkaran recorded", () => {
    expect(deriveKavlingStatus({ hakPakai: { status: "dibatalkan", pembongkaranAt: null }, totalPetak: 2, petakWithPemakaman: 0 })).toBe("tersedia");
    expect(deriveKavlingStatus({ hakPakai: { status: "berakhir", pembongkaranAt: new Date("2026-11-01T00:00:00+07:00") }, totalPetak: 2, petakWithPemakaman: 2 })).toBe("tersedia");
  });

  it("has no manual Tidak Tersedia (unlike a Petak)", () => {
    // A Kavling under a Kedaluwarsa or not-yet-dibongkar Berakhir Hak Pakai is still "occupied" in some degree, never Tidak Tersedia.
    expect(deriveKavlingStatus({ hakPakai: { status: "kedaluwarsa", pembongkaranAt: null }, totalPetak: 2, petakWithPemakaman: 2 })).toBe("penuh");
  });
});
