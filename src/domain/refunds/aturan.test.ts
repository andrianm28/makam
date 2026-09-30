/**
 * The Biaya Layanan Platform rule (spec, Billing > Refunds table; ticket 31's
 * AC 1), tested directly for every `PihakBersalah` — not only "pemesan", the
 * one source with a real caller today (ticket 24's Saat Duka cancellation).
 */
import { describe, expect, it } from "vitest";
import { bagianDibayar, biayaLayananPlatformDikembalikan } from "./aturan";

describe("whether the Biaya Layanan Platform is refunded", () => {
  it("stays kept when the Pemesan cancels", () => {
    expect(biayaLayananPlatformDikembalikan("pemesan")).toBe(false);
  });

  it("is refunded when the fault lies with the Lokasi, the Mitra Jasa or the Operator", () => {
    expect(biayaLayananPlatformDikembalikan("lokasi")).toBe(true);
    expect(biayaLayananPlatformDikembalikan("mitra_jasa")).toBe(true);
    expect(biayaLayananPlatformDikembalikan("operator")).toBe(true);
  });
});

describe("the share of a line the family really paid after a Harga Khusus (ticket 95)", () => {
  const lines = [
    { kind: "layanan", amount: 750_000 },
    { kind: "biaya_layanan_platform", amount: 150_000 },
    { kind: "penyesuaian_harga_khusus", amount: -50_000 },
  ];

  it("returns a line whole when no Harga Khusus was given", () => {
    expect(bagianDibayar(lines.slice(0, 2), 750_000)).toBe(750_000);
  });

  it("returns the line's proportional share, rounded down, so the shares never exceed what was paid", () => {
    expect(bagianDibayar(lines, 750_000)).toBe(708_333);
    expect(bagianDibayar(lines, 150_000)).toBe(141_666);
    expect(bagianDibayar(lines, 750_000) + bagianDibayar(lines, 150_000)).toBeLessThanOrEqual(850_000);
  });
});
