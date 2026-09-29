import { describe, expect, it } from "vitest";
import { bolehDiperpanjang, samarkanEmail, tambahBulan } from "@/domain/perpanjangan";

const HAK = { status: "aktif", tenureYears: 5, endDate: "2026-10-15", perluVerifikasi: false } as const;

describe("a Perpanjangan is open from 3 months before the end date to the end of the Masa Tenggang", () => {
  it("opens exactly 3 months before the end date and stays open through the last day of the Masa Tenggang", () => {
    expect(bolehDiperpanjang(HAK, "2026-07-14", 3)).toEqual({ boleh: false, catatan: { kind: "terlalu_awal", mulaiPada: "2026-07-15" } });
    expect(bolehDiperpanjang(HAK, "2026-07-15", 3)).toMatchObject({ boleh: true, dibukaSejak: "2026-07-15", masaTenggangBerakhir: "2027-01-15" });
    expect(bolehDiperpanjang(HAK, "2027-01-15", 3)).toMatchObject({ boleh: true });
    expect(bolehDiperpanjang(HAK, "2027-01-16", 3)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "lewat_masa_tenggang" } });
  });

  it("follows the Lokasi's own Masa Tenggang", () => {
    expect(bolehDiperpanjang(HAK, "2027-01-16", 6)).toMatchObject({ boleh: true, masaTenggangBerakhir: "2027-04-15" });
    expect(bolehDiperpanjang(HAK, "2026-10-16", 0)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "lewat_masa_tenggang" } });
  });

  it("says why it is not offered: perpetual, Berakhir, Dibatalkan, Perlu Verifikasi or no end date on record", () => {
    expect(bolehDiperpanjang({ ...HAK, tenureYears: null, endDate: null }, "2026-10-01", 3)).toEqual({ boleh: false, catatan: { kind: "selamanya" } });
    expect(bolehDiperpanjang({ ...HAK, status: "berakhir" }, "2026-10-01", 3)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "berakhir" } });
    expect(bolehDiperpanjang({ ...HAK, status: "dibatalkan" }, "2026-10-01", 3)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "dibatalkan" } });
    expect(bolehDiperpanjang({ ...HAK, perluVerifikasi: true }, "2026-10-01", 3)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "perlu_verifikasi" } });
    expect(bolehDiperpanjang({ ...HAK, endDate: null }, "2026-10-01", 3)).toEqual({ boleh: false, catatan: { kind: "hubungi_admin_lokasi", sebab: "tanggal_belum_tercatat" } });
  });

  it("treats a Kedaluwarsa Hak Pakai like an Aktif one: it is still extendable inside the Masa Tenggang", () => {
    expect(bolehDiperpanjang({ ...HAK, status: "kedaluwarsa" }, "2026-11-20", 3)).toMatchObject({ boleh: true });
  });
});

describe("calendar months", () => {
  it("clamps to the last day of a shorter month", () => {
    expect(tambahBulan("2026-05-31", -3)).toBe("2026-02-28");
    expect(tambahBulan("2026-11-30", 3)).toBe("2027-02-28");
    expect(tambahBulan("2028-05-31", -3)).toBe("2028-02-29");
  });
});

describe("the recorded email is never shown whole", () => {
  it("masks all but the first letter of the local part", () => {
    expect(samarkanEmail("pemegang@contoh.id")).toBe("p***@contoh.id");
  });
});
