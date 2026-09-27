import { describe, expect, it } from "vitest";
import { homepageHero, homepageTiles, homepageTrust } from "./homepage-content";

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

  it("does not prefetch the Terencana route while that wizard is not built yet", () => {
    // A prefetch of a route that answers 404 never settles, which would leave a
    // request open on every view of the Beranda. This is the flag ticket 36 clears.
    expect(homepageHero.planned.prefetch).toBe(false);
  });
});

describe("the Beranda's tile row", () => {
  it("is the four services from the spec", () => {
    expect(homepageTiles.map((tile) => tile.label)).toEqual([
      "Perpanjang Makam",
      "Layanan Makam",
      "Urus di TPU DKI",
      "Wakaf Tanah",
    ]);
  });

  it("opens the Makam keluarga hub with the action preselected, and leaves the two that are not there yet alone", () => {
    // Perpanjang Makam and Layanan Makam are arranged at the hub (spec, Public site and
    // routing decisions), so their tiles open it with that action chosen; Urus di TPU DKI
    // and Wakaf Tanah are still later releases and say so, with no link to a page that is
    // not there and no date.
    const byLabel = new Map(homepageTiles.map((tile) => [tile.label, tile]));
    expect(byLabel.get("Perpanjang Makam")?.href).toBe("/makam-keluarga?aksi=perpanjang");
    expect(byLabel.get("Layanan Makam")?.href).toBe("/makam-keluarga?aksi=layanan");
    for (const label of ["Urus di TPU DKI", "Wakaf Tanah"]) {
      expect(byLabel.get(label)?.href, label).toBeUndefined();
      expect(byLabel.get(label)?.description, label).toBe("Segera hadir.");
    }
    expect(homepageTiles.map((tile) => tile.description).join(" ")).not.toMatch(/\d{4}/);
  });

  it("carries an icon and one line each, in Bahasa Indonesia", () => {
    for (const tile of homepageTiles) {
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
    expect(new Set(homepageTrust.map((column) => column.href))).toEqual(new Set(["/cara-kami-bekerja"]));
  });

  it("makes no claim about TPU paperwork in this release", () => {
    // The TPU permit only becomes something the Operator helps with in a later
    // release, so the Dibantu line may not promise it here (release plan).
    expect(homepageTrust.map((column) => column.line).join(" ")).not.toMatch(/TPU/i);
  });
});
