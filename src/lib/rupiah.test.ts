import { describe, expect, it } from "vitest";
import { RUPIAH_MAX, rupiahFromDatabase, rupiahSchema, sumRupiah, timesRupiah, type Rupiah } from "./rupiah";

const rp = (amount: number) => rupiahSchema.parse(amount);

describe("Rupiah: whole rupiah, never a float, at most Rp 100.000.000.000", () => {
  it("an amount is a whole number from Rp 0 to Rp 100.000.000.000", () => {
    expect(RUPIAH_MAX).toBe(100_000_000_000);
    expect(rupiahSchema.safeParse(0).success).toBe(true);
    expect(rupiahSchema.safeParse(100_000_000_000).success).toBe(true);
    expect(rupiahSchema.safeParse(100_000_000_001).success).toBe(false);
    expect(rupiahSchema.safeParse(-1).success).toBe(false);
    expect(rupiahSchema.safeParse(1.5).success).toBe(false);
  });

  it("a sum up to the maximum is exact; one past it is refused (jumlah_terlalu_besar), never rounded", () => {
    expect(sumRupiah([rp(99_999_999_999), rp(1)])).toEqual({ ok: true, amount: 100_000_000_000 });
    expect(sumRupiah([rp(100_000_000_000), rp(1)])).toEqual({ ok: false, reason: "jumlah_terlalu_besar" });
    expect(sumRupiah([])).toEqual({ ok: true, amount: 0 });
  });

  it("a price times a number of terms up to the maximum is exact; past it, refused", () => {
    expect(timesRupiah(rp(50_000_000_000), 2)).toEqual({ ok: true, amount: 100_000_000_000 });
    expect(timesRupiah(rp(50_000_000_001), 2)).toEqual({ ok: false, reason: "jumlah_terlalu_besar" });
    expect(timesRupiah(rp(100_000_000_000), Number.MAX_SAFE_INTEGER)).toEqual({ ok: false, reason: "jumlah_terlalu_besar" });
  });

  it("an amount read from a bigint column is converted exactly, and a value beyond the safe range or the maximum is refused", () => {
    const read: Rupiah = rupiahFromDatabase("7512345");
    expect(read).toBe(7_512_345);
    expect(rupiahFromDatabase("100000000000")).toBe(100_000_000_000);
    expect(() => rupiahFromDatabase("100000000001")).toThrow(/rupiah/i);
    expect(() => rupiahFromDatabase("9007199254740993")).toThrow(/rupiah/i);
    expect(() => rupiahFromDatabase("-1")).toThrow(/rupiah/i);
  });
});
