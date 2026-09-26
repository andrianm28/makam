import { describe, expect, it } from "vitest";
import { formatBulanTahun, formatTanggalPanjang } from "./format-tanggal";

describe("Indonesian date formatting for public copy", () => {
  it("formatBulanTahun: 'dikunjungi <bulan tahun>'", () => {
    expect(formatBulanTahun("2026-09-05")).toBe("September 2026");
    expect(formatBulanTahun("2027-01-01")).toBe("Januari 2027");
  });

  it("formatTanggalPanjang: a visit photo's dated caption", () => {
    expect(formatTanggalPanjang("2026-09-05")).toBe("5 September 2026");
  });
});
