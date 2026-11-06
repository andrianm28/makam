import { describe, expect, it } from "vitest";
import { pageExists } from "../../tests/support/page-exists";
import { kontenDariSlug } from "./kedukaan-konten";
import { contentPageLinks, publicMenu, publicMenuLabels } from "./public-navigation";

/** A menu as its reader sees it: the labels in order. */
const labels = (signedIn: boolean) => publicMenu({ signedIn }).map((item) => item.label);

describe("the public site menu (rapat Ira, 6 Nov 2026)", () => {
  it("lists Jasa Pemakaman, Layanan Kedukaan and Proteksi Kedukaan, then the account item: no Daftar Lokasi and no wakaf programme", () => {
    expect(labels(false)).toEqual(["Jasa Pemakaman", "Layanan Kedukaan", "Proteksi Kedukaan", "Masuk"]);
  });

  it("offers Akun Saya instead of Masuk to a signed-in visitor", () => {
    expect(labels(true)).toEqual([...publicMenuLabels, "Akun Saya"]);
  });

  it("puts only Pesan Sekarang and Konsultasi Rencana Pemakaman under Jasa Pemakaman: Makam Keluarga is hidden for now", () => {
    const jasa = publicMenu({ signedIn: false }).find((item) => item.label === "Jasa Pemakaman");
    expect(jasa?.children?.map((child) => [child.label, child.href])).toEqual([
      ["Pesan Sekarang", "/pesan-makam/saat-duka"],
      ["Konsultasi Rencana Pemakaman", "/konsultasi-rencana-pemakaman"],
    ]);
  });

  it("lists Rumah Duka, and Jasa Cargo, Repatriasi and Bunga Duka Cita as Segera hadir, with no Mobil or Peti Jenazah", () => {
    const kedukaan = publicMenu({ signedIn: false }).find((item) => item.label === "Layanan Kedukaan");
    expect(kedukaan?.href).toBe("/layanan-kedukaan");
    expect(kedukaan?.children?.map((child) => [child.label, child.href ?? null, child.description])).toEqual([
      ["Rumah Duka", "/layanan-kedukaan/rumah-duka", expect.any(String)],
      ["Jasa Cargo Jenazah", null, "Segera hadir."],
      ["Jasa Repatriasi Jenazah", null, "Segera hadir."],
      ["Bunga Duka Cita", null, "Segera hadir."],
    ]);
  });

  it("shows Proteksi Kedukaan as Segera hadir, with no link and no date", () => {
    const proteksi = publicMenu({ signedIn: false }).find((item) => item.label === "Proteksi Kedukaan");
    expect(proteksi).toEqual({ label: "Proteksi Kedukaan", description: "Segera hadir." });
    expect(JSON.stringify(publicMenu({ signedIn: false }))).not.toMatch(/\d{4}/);
  });

  it("leads every visitor to Masuk", () => {
    expect(publicMenu({ signedIn: false }).find((item) => item.label === "Masuk")?.href).toBe("/masuk");
  });
});

describe("the content pages", () => {
  it("are the four written for this release and the Kebijakan Privasi; the Lokasi directory left the footer too", () => {
    expect(contentPageLinks).toEqual([
      { href: "/tentang-kami", label: "Tentang Kami" },
      { href: "/cara-kami-bekerja", label: "Cara Kami Bekerja" },
      { href: "/faq", label: "FAQ" },
      { href: "/hubungi-kami", label: "Hubungi Kami" },
      { href: "/kebijakan-privasi", label: "Kebijakan Privasi" },
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

/** A Layanan Kedukaan's page: the one dynamic route, open only for the six it knows. */
function halamanKedukaan(href: string): boolean {
  const slug = /^\/layanan-kedukaan\/([^/]+)$/.exec(href)?.[1];
  return slug !== undefined && kontenDariSlug(slug) !== null && pageExists("/layanan-kedukaan/[jenis]");
}

describe("the menu's links", () => {
  it("every one opens a page that exists, or the one route a pending ticket adds", () => {
    const links = [
      ...publicMenu({ signedIn: false }),
      ...publicMenu({ signedIn: true }),
    ]
      .flatMap((item) => [item, ...(item.children ?? [])])
      .map((item) => item.href?.split("?")[0])
      .filter((href): href is string => href !== undefined);
    for (const href of links) {
      expect(pageExists(href) || routeMenungguTiket.has(href) || halamanKedukaan(href), href).toBe(true);
    }
  });
});
