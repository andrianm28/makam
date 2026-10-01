import { describe, expect, it } from "vitest";
import { nilaiDibayarBaris, termasukTarif, tarifDari } from "./nilai-dibayar";
import type { TagihanLine } from "./tagihan";

/** Enough of a Tagihan line for the one rule: its kind and its amount. */
type Line = Pick<TagihanLine, "kind" | "amount">;

const hakPakai = (amount: number): Line => ({ kind: "harga_hak_pakai", amount });
const biayaPemakaman = (amount: number): Line => ({ kind: "biaya_pemakaman", amount });
const biayaPengurusan = (amount: number): Line => ({ kind: "biaya_pengurusan", amount });
const layanan = (amount: number): Line => ({ kind: "layanan", amount });
const biayaLayananPlatform = (amount: number): Line => ({ kind: "biaya_layanan_platform", amount });
const penyesuaianHargaKhusus = (amount: number): Line => ({ kind: "penyesuaian_harga_khusus", amount });

describe("what one line of a Tagihan is worth after a Harga Khusus", () => {
  it("returns the line's own amount when the Tagihan has no Penyesuaian Harga Khusus", () => {
    const lines = [hakPakai(1_000_000), biayaLayananPlatform(200_000)];
    expect(nilaiDibayarBaris(lines, lines[0]!)).toBe(1_000_000);
    expect(nilaiDibayarBaris(lines, lines[1]!)).toBe(200_000);
  });

  it("returns the line's proportional share of the reduced tariff, the Biaya Layanan Platform left out", () => {
    const lines = [hakPakai(2_500_000), hakPakai(2_500_000), biayaLayananPlatform(250_000), penyesuaianHargaKhusus(-1_500_000)];
    expect(nilaiDibayarBaris(lines, lines[0]!)).toBe(1_750_000);
  });

  it("rounds the share down to whole rupiah", () => {
    // 1_000_000 × 1_999_999 / 2_000_000 = 999_999,5
    const lines = [hakPakai(1_000_000), hakPakai(1_000_000), penyesuaianHargaKhusus(-1)];
    expect(nilaiDibayarBaris(lines, lines[0]!)).toBe(999_999);
  });

  it("never returns more than the line's own amount", () => {
    const lines = [hakPakai(1_000_000), penyesuaianHargaKhusus(-1)];
    expect(nilaiDibayarBaris(lines, lines[0]!)).toBeLessThanOrEqual(1_000_000);
  });

  it("still returns a positive share when the Penyesuaian is larger than the tariff, so Refunds never refuses a paid line", () => {
    // tariff Rp 1.000.000 + fee Rp 200.000, reduced by Rp 1.100.000: the family paid Rp 100.000.
    const lines = [layanan(1_000_000), biayaLayananPlatform(200_000), penyesuaianHargaKhusus(-1_100_000)];
    const bagian = nilaiDibayarBaris(lines, lines[0]!);
    const bagianFee = nilaiDibayarBaris(lines, lines[1]!);
    expect(bagian).toBeGreaterThan(0);
    expect(bagianFee).toBeGreaterThan(0);
    // Both shares together are the reduced total, never more than what was paid.
    expect(bagian + bagianFee).toBeLessThanOrEqual(100_000);
  });

  it("spreads the Penyesuaian over the whole tariff, a biaya_pemakaman or biaya_pengurusan line included", () => {
    // A Terencana Tagihan carrying the plot's Harga Hak Pakai plus a biaya_pemakaman and biaya_pengurusan:
    // each tariff line bears its share of the whole-Tagihan Penyesuaian, so no share lands on one line alone.
    const lines = [hakPakai(2_500_000), biayaPemakaman(500_000), biayaPengurusan(200_000), penyesuaianHargaKhusus(-480_000)];
    expect(nilaiDibayarBaris(lines, lines[0]!)).toBe(2_125_000);
    expect(nilaiDibayarBaris(lines, lines[1]!)).toBe(425_000);
    expect(nilaiDibayarBaris(lines, lines[2]!)).toBe(170_000);
  });

  it("counts the tariff as every line but the Biaya Layanan Platform and the Penyesuaian Harga Khusus", () => {
    expect(tarifDari([hakPakai(1_000_000), layanan(500_000), biayaLayananPlatform(300_000), penyesuaianHargaKhusus(-50_000)])).toBe(1_500_000);
    expect(termasukTarif(biayaLayananPlatform(1))).toBe(false);
    expect(termasukTarif(penyesuaianHargaKhusus(-1))).toBe(false);
    expect(termasukTarif(hakPakai(1))).toBe(true);
    expect(termasukTarif(layanan(1))).toBe(true);
  });
});
