import { describe, expect, it } from "vitest";
import { adaHargaKhusus, biayaLayananPlatformTerbayar, nilaiDibayarBaris, termasukTarif, tarifDari } from "@/domain/billing";
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

  it("returns the tariff line in full while the Harga Khusus is still borne by the fee", () => {
    // The fee first (spec 503): the Harga Khusus of Rp 50.000 comes out of the Rp 150.000 fee, so the tariff is untouched.
    const lines = [layanan(750_000), biayaLayananPlatform(150_000), penyesuaianHargaKhusus(-50_000)];
    expect(nilaiDibayarBaris(lines, lines[0]!)).toBe(750_000);
    expect(biayaLayananPlatformTerbayar(lines)).toBe(100_000);
  });

  it("reduces the tariff proportionally only by the part of the Harga Khusus that exceeds the fee", () => {
    // Excess = 1_500_000 − 250_000 = 1_250_000 over a Rp 5.000.000 tariff: 2_500_000 × 3_750_000/5_000_000.
    const lines = [hakPakai(2_500_000), hakPakai(2_500_000), biayaLayananPlatform(250_000), penyesuaianHargaKhusus(-1_500_000)];
    expect(nilaiDibayarBaris(lines, lines[0]!)).toBe(1_875_000);
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

  it("still returns the tariff line's share when the Harga Khusus passes the fee, and leaves the fee with nothing payable", () => {
    // Excess = 1_100_000 − 200_000 = 900_000 over a Rp 1.000.000 tariff: the line still comes back.
    const lines = [layanan(1_000_000), biayaLayananPlatform(200_000), penyesuaianHargaKhusus(-1_100_000)];
    const bagian = nilaiDibayarBaris(lines, lines[0]!);
    expect(bagian).toBe(100_000);
    // The Harga Khusus ate the whole fee, so none of it is payable: the refund is the reduced tariff alone.
    expect(biayaLayananPlatformTerbayar(lines)).toBe(0);
    expect(bagian).toBeLessThanOrEqual(100_000);
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

describe("the Biaya Layanan Platform that may return after a Harga Khusus", () => {
  it("returns the whole fee when there is no Penyesuaian Harga Khusus", () => {
    const lines = [layanan(750_000), biayaLayananPlatform(150_000)];
    expect(biayaLayananPlatformTerbayar(lines)).toBe(150_000);
  });

  it("takes the Harga Khusus from the fee first, leaving the rest payable", () => {
    // spec 503: "a Harga Khusus is borne by the Operator from the Biaya Layanan Platform first".
    const lines = [layanan(750_000), biayaLayananPlatform(150_000), penyesuaianHargaKhusus(-50_000)];
    expect(biayaLayananPlatformTerbayar(lines)).toBe(100_000);
  });

  it("leaves nothing payable once the Harga Khusus has eaten the whole fee", () => {
    const lines = [layanan(750_000), biayaLayananPlatform(150_000), penyesuaianHargaKhusus(-800_000)];
    expect(biayaLayananPlatformTerbayar(lines)).toBe(0);
  });

  it("never returns more than the fee issued, even a positive Penyesuaian", () => {
    const lines = [layanan(750_000), biayaLayananPlatform(150_000), penyesuaianHargaKhusus(20_000)];
    expect(biayaLayananPlatformTerbayar(lines)).toBe(150_000);
  });

  it("returns nothing when the Tagihan carries no Biaya Layanan Platform line", () => {
    expect(biayaLayananPlatformTerbayar([layanan(750_000), penyesuaianHargaKhusus(-50_000)])).toBe(0);
  });
});

describe("whether a Tagihan carries a Harga Khusus", () => {
  it("is true only when a Penyesuaian Harga Khusus line is present", () => {
    expect(adaHargaKhusus([layanan(750_000), penyesuaianHargaKhusus(-50_000)])).toBe(true);
    expect(adaHargaKhusus([layanan(750_000), biayaLayananPlatform(150_000)])).toBe(false);
  });
});
