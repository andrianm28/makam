import { describe, expect, it } from "vitest";
import { pageExists } from "../../tests/support/page-exists";
import { contentPageLinks, publicMenu, publicMenuLabels } from "./public-navigation";

/** A menu as its reader sees it: the labels in order. */
const labels = (signedIn: boolean) => publicMenu({ signedIn }).map((item) => item.label);

describe("the public site menu", () => {
  it("lists Pesan Makam, Makam Keluarga, Layanan, Wakaf Tanah, Daftar Lokasi, then the account item", () => {
    expect(labels(false)).toEqual([
      "Pesan Makam",
      "Makam Keluarga",
      "Layanan",
      "Wakaf Tanah",
      "Daftar Lokasi",
      "Masuk",
    ]);
  });

  it("offers Akun Saya instead of Masuk to a signed-in visitor", () => {
    expect(labels(true)).toEqual([...publicMenuLabels, "Akun Saya"]);
  });

  it("leads every visitor to the Saat Duka entry and to the Lokasi directory", () => {
    const menu = publicMenu({ signedIn: false });
    expect(menu.find((item) => item.label === "Pesan Makam")?.href).toBe("/pesan-makam/saat-duka");
    expect(menu.find((item) => item.label === "Daftar Lokasi")?.href).toBe("/lokasi");
    expect(menu.find((item) => item.label === "Masuk")?.href).toBe("/masuk");
  });

  it("never links an item whose page is not built yet, and says so instead of a date", () => {
    // The Makam keluarga hub is built, so that item opens it; Layanan
    // ships in a later release. A dead link is worse than an honest "Segera hadir", so
    // those items carry no href at all and never a release date (the brand's guardrails).
    const unbuilt = publicMenu({ signedIn: false }).filter((item) => !item.href);
    expect(unbuilt.map((item) => item.label)).toEqual(["Layanan"]);
    for (const item of unbuilt) expect(item.description).toBe("Segera hadir.");
    expect(publicMenu({ signedIn: false }).map((item) => item.description).join(" ")).not.toMatch(/\d{4}/);
  });

  it("opens the Makam keluarga hub for the item that owns it", () => {
    expect(publicMenu({ signedIn: false }).find((item) => item.label === "Makam Keluarga")?.href).toBe("/makam-keluarga");
  });
});

describe("the content pages", () => {
  it("are the four written for this release plus the Lokasi directory", () => {
    expect(contentPageLinks).toEqual([
      { href: "/tentang-kami", label: "Tentang Kami" },
      { href: "/cara-kami-bekerja", label: "Cara Kami Bekerja" },
      { href: "/faq", label: "FAQ" },
      { href: "/hubungi-kami", label: "Hubungi Kami" },
      { href: "/lokasi", label: "Daftar Lokasi" },
    ]);
  });

  it("all have a page", () => {
    for (const page of contentPageLinks) {
      expect(pageExists(page.href), page.href).toBe(true);
    }
  });
});

/**
 * The one menu item that points at a route a ticket in this same release has not
 * landed yet: the Terencana wizard (Rilis 1, ticket 36). Named here so the check
 * below can tell a deliberate forward link from a dead one, and so the list has
 * to be emptied when that ticket merges.
 */
const routeMenungguTiket = new Set(["/pesan-makam/terencana"]);

describe("the menu's links", () => {
  it("every one opens a page that exists, or the one route a pending ticket adds", () => {
    const links = [
      ...publicMenu({ signedIn: false }),
      ...publicMenu({ signedIn: true }),
    ]
      .map((item) => item.href)
      .filter((href): href is string => href !== undefined);
    for (const href of links) {
      expect(pageExists(href) || routeMenungguTiket.has(href), href).toBe(true);
    }
  });
});
