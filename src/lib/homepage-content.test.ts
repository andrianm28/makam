import { describe, expect, it } from "vitest";
import { homepageCsBand, homepageInfoMakamSwasta, homepageHero, homepageTiles, homepageTilesUntuk, homepageTrust, homepageTrustLink } from "./homepage-content";

/**
 * The Beranda's hero, tile row and trust strip (spec, Public site and routing
 * decisions > Home). Perpanjang Makam and Layanan Makam are arranged at the Makam
 * keluarga hub and open it with that action preselected; Urus di TPU DKI and Wakaf
 * Tanah are in a later release, so they say so and name the CS instead of opening a
 * page that does not exist.
 */
describe("the Beranda's hero", () => {
  it("leads with the brand master message and the tagline", () => {
    expect(homepageHero.headline).toBe("Urus Pemakaman dengan Tenang, dalam Satu Platform.");
    expect(homepageHero.tagline).toBe("Menemani Keluarga, Menjaga Kenangan.");
  });

  it("offers the urgent entry as the one button, and the planned one as a text link of its own", () => {
    expect(homepageHero.urgent.href).toBe("/pesan-makam/saat-duka");
    expect(homepageHero.urgent.caption).toBe("untuk keluarga yang baru saja kehilangan");
    // "Siapkan makam untuk nanti" is not part of the urgent flow: its own entry,
    // never a second button that competes with the first.
    expect(homepageHero.planned.href).toBe("/pesan-makam/terencana");
    expect(homepageHero.planned.label).toBe("Siapkan makam untuk nanti");
  });

  it("tells a family that nothing is paid when the order is sent", () => {
    expect(homepageHero.reassurance).toMatch(/Tidak ada yang dibayar/);
  });
});

describe("the Beranda's tile row", () => {
  it("shows the services of the menu: Pesan Sekarang, Konsultasi, Layanan Kedukaan and Proteksi Kedukaan (rapat Ira, 6 Nov 2026)", () => {
    expect(homepageTiles.map((tile) => tile.label)).toEqual([
      "Pesan Sekarang",
      "Konsultasi Rencana Pemakaman",
      "Layanan Kedukaan",
      "Proteksi Kedukaan",
    ]);
  });

  it("hides Makam Keluarga and Wakaf Tanah, and Proteksi Kedukaan says Segera hadir with no link", () => {
    const byLabel = new Map(homepageTilesUntuk(3).map((tile) => [tile.label, tile]));
    expect(byLabel.get("Pesan Sekarang")?.href).toBe("/pesan-makam/saat-duka");
    expect(byLabel.get("Konsultasi Rencana Pemakaman")?.href).toBe("/konsultasi-rencana-pemakaman");
    expect(byLabel.get("Layanan Kedukaan")?.href).toBe("/layanan-kedukaan");
    expect(byLabel.get("Proteksi Kedukaan")?.href).toBeUndefined();
    const hrefs = homepageTiles.map((tile) => tile.href ?? tile.hrefBilaTerbuka?.href ?? "");
    expect(hrefs.join(" ")).not.toMatch(/makam-keluarga|wakaf/);
  });

  it("carries a photograph with alt text and one line each, in Bahasa Indonesia", () => {
    for (const tile of homepageTiles) {
      expect(tile.image).toMatch(/^\/content\/.+\.jpg$/);
      expect(tile.imageAlt).toMatch(/[.!?]$/);
      expect(tile.summary.length).toBeGreaterThan(20);
      expect(tile.summary).toMatch(/[.!?]$/);
    }
  });
});

describe("the Beranda's trust strip", () => {
  it("is Dibantu, Jelas, Aman, each with one concrete line", () => {
    expect(homepageTrust.map((column) => column.label)).toEqual(["Dibantu", "Jelas", "Aman"]);
    for (const column of homepageTrust) {
      expect(column.line.length).toBeGreaterThan(20);
      expect(column.line).toMatch(/[.!?]$/);
    }
  });

  it("links to Cara Kami Bekerja, where each claim is explained", () => {
    expect(homepageTrustLink.href).toBe("/cara-kami-bekerja");
  });

  it("makes no claim about TPU paperwork in this release", () => {
    // The TPU permit only becomes something the Operator helps with in a later
    // release, so the Dibantu line may not promise it here (release plan).
    expect(homepageTrust.map((column) => column.line).join(" ")).not.toMatch(/TPU/i);
  });
});

describe("the Beranda's Info Makam Swasta band", () => {
  it("links to /info-makam-swasta, says the locations are not partners and cannot be ordered, and never claims Terverifikasi", () => {
    expect(homepageInfoMakamSwasta.link.href).toBe("/info-makam-swasta");
    expect(homepageInfoMakamSwasta.badge).toBe("Belum bermitra");
    const text = [homepageInfoMakamSwasta.heading, homepageInfoMakamSwasta.line, homepageInfoMakamSwasta.link.label].join(" ");
    expect(text).toContain("belum bermitra");
    expect(text).toContain("Belum bisa dipesan");
    expect(text).not.toMatch(/terverifikasi/i);
  });
});
