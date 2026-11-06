import { describe, expect, it } from "vitest";
import { DAFTAR_INFO_MAKAM_SWASTA, pesanKonsultasi } from "./daftar";

describe("Info Makam Swasta: public information on private cemeteries that are not Lokasi Mitra", () => {
  it("lists the nine researched locations not yet Lokasi Mitra, each once; Graha Sentosa left it when it became one", () => {
    expect(DAFTAR_INFO_MAKAM_SWASTA).toHaveLength(9);
    expect(DAFTAR_INFO_MAKAM_SWASTA.map((l) => l.nama)).not.toContain("Graha Sentosa Memorial Park");
    const slugs = DAFTAR_INFO_MAKAM_SWASTA.map((l) => l.slug);
    expect(new Set(slugs).size).toBe(9);
  });

  it("names a public source for every location", () => {
    for (const lokasi of DAFTAR_INFO_MAKAM_SWASTA) expect(lokasi.sumber.length).toBeGreaterThan(0);
  });

  it("never claims a location is a verified partner or shows a price", () => {
    for (const lokasi of DAFTAR_INFO_MAKAM_SWASTA) {
      const teks = JSON.stringify(lokasi);
      expect(teks).not.toMatch(/terverifikasi|bermitra|harga|pesan sekarang|bersertifikat|Rp\s?\d/i);
    }
  });

  it("opens the CS consultation with the location's name", () => {
    expect(pesanKonsultasi("Graha Sentosa Memorial Park")).toBe(
      "Halo CS Makam.co.id, saya ingin konsultasi tentang Graha Sentosa Memorial Park.",
    );
  });
});
