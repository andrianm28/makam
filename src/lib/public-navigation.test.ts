import { describe, expect, it } from "vitest";
import { pageExists } from "../../tests/support/page-exists";
import { kontenDariSlug } from "./kedukaan-konten";
import { contentPageLinks, publicMenu, publicMenuLabels } from "./public-navigation";

/** A menu as its reader sees it: the labels in order. */
const labels = (signedIn: boolean) => publicMenu({ signedIn }).map((item) => item.label);

describe("the public site menu", () => {
  it("lists the owner's four groups, Jasa Pemakaman, Layanan Kedukaan, Program Wakaf Tanah Pemakaman, Daftar Lokasi, then the account item", () => {
    expect(labels(false)).toEqual(["Jasa Pemakaman", "Layanan Kedukaan", "Program Wakaf Tanah Pemakaman", "Daftar Lokasi", "Masuk"]);
  });

  it("offers Akun Saya instead of Masuk to a signed-in visitor", () => {
    expect(labels(true)).toEqual([...publicMenuLabels, "Akun Saya"]);
  });

  it("puts Pesan Sekarang, Konsultasi Rencana Pemakaman and Makam Keluarga under Jasa Pemakaman", () => {
    const jasa = publicMenu({ signedIn: false }).find((item) => item.label === "Jasa Pemakaman");
    expect(jasa?.children?.map((child) => [child.label, child.href])).toEqual([
      ["Pesan Sekarang", "/pesan-makam/saat-duka"],
      ["Konsultasi Rencana Pemakaman", "/konsultasi-rencana-pemakaman"],
      ["Makam Keluarga", "/makam-keluarga"],
    ]);
  });

  it("lists the six Layanan Kedukaan under their group, which opens its own page", () => {
    const kedukaan = publicMenu({ signedIn: false }).find((item) => item.label === "Layanan Kedukaan");
    expect(kedukaan?.href).toBe("/layanan-kedukaan");
    expect(kedukaan?.children?.map((child) => child.label)).toEqual([
      "Rumah Duka",
      "Mobil Jenazah",
      "Jasa Cargo Jenazah",
      "Jasa Repatriasi Jenazah",
      "Peti Jenazah",
      "Bunga Duka Cita",
    ]);
  });

  it("leads every visitor to the Lokasi directory and to Masuk", () => {
    const menu = publicMenu({ signedIn: false });
    expect(menu.find((item) => item.label === "Daftar Lokasi")?.href).toBe("/lokasi");
    expect(menu.find((item) => item.label === "Masuk")?.href).toBe("/masuk");
  });

  it("never links the wakaf programme before its release is open, and says so instead of a date", () => {
    const unbuilt = publicMenu({ signedIn: false, rilis: 1 }).filter((item) => !item.href);
    expect(unbuilt.map((item) => item.label)).toEqual(["Program Wakaf Tanah Pemakaman"]);
    for (const item of unbuilt) expect(item.description).toBe("Segera hadir.");
    expect(publicMenu({ signedIn: false, rilis: 3 }).find((item) => item.label === "Program Wakaf Tanah Pemakaman")?.href).toBe("/wakaf-tanah");
    expect(JSON.stringify(publicMenu({ signedIn: false }))).not.toMatch(/\d{4}/);
  });
});

describe("the content pages", () => {
  it("are the four written for this release, the Lokasi directory and the Kebijakan Privasi", () => {
    expect(contentPageLinks).toEqual([
      { href: "/tentang-kami", label: "Tentang Kami" },
      { href: "/cara-kami-bekerja", label: "Cara Kami Bekerja" },
      { href: "/faq", label: "FAQ" },
      { href: "/hubungi-kami", label: "Hubungi Kami" },
      { href: "/lokasi", label: "Daftar Lokasi" },
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
