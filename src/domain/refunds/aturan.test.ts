/**
 * The Biaya Layanan Platform rule (spec, Billing > Refunds table; ticket 31's
 * AC 1), tested directly for every `PihakBersalah` — not only "pemesan", the
 * one source with a real caller today (ticket 24's Saat Duka cancellation).
 */
import { describe, expect, it } from "vitest";
import { biayaLayananPlatformDikembalikan } from "./aturan";

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
