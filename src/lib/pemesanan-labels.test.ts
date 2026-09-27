import { describe, expect, it } from "vitest";
import { jatuhTempoLabel } from "./pemesanan-labels";

/**
 * The pay-after deadline a family reads (AC 1: the Lokasi Mitra's own Saat Duka
 * payment window after the burial). The number comes from the Lokasi's policy,
 * so this is where a window that is not the default has to read right.
 */
describe("when a family is told when the Tagihan falls due", () => {
  it("names the Lokasi's own window in days when it is a whole number of days", () => {
    expect(jatuhTempoLabel(24)).toBe("jatuh tempo sehari setelah pemakaman");
    expect(jatuhTempoLabel(72)).toBe("jatuh tempo tiga hari setelah pemakaman");
    expect(jatuhTempoLabel(120)).toBe("jatuh tempo lima hari setelah pemakaman");
    expect(jatuhTempoLabel(336)).toBe("jatuh tempo dua minggu setelah pemakaman");
  });

  it("names the hours themselves when the window is not a whole day", () => {
    expect(jatuhTempoLabel(36)).toBe("jatuh tempo 36 jam setelah pemakaman");
    expect(jatuhTempoLabel(1)).toBe("jatuh tempo 1 jam setelah pemakaman");
  });

  it("two Lokasi with different windows say two different things", () => {
    const pendek = jatuhTempoLabel(24);
    const panjang = jatuhTempoLabel(168);
    expect(pendek).not.toBe(panjang);
    expect(pendek).toContain("sehari");
    expect(panjang).toContain("tujuh hari");
  });

  it("says nothing about a span it cannot read rather than guessing one", () => {
    expect(jatuhTempoLabel(null)).toBe("sesuai jangka yang ditetapkan Lokasi Mitra");
    expect(jatuhTempoLabel(0)).toBe("sesuai jangka yang ditetapkan Lokasi Mitra");
  });
});
