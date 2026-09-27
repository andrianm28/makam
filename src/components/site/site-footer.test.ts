import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

/** The public site's footer (spec, Public site and routing decisions; AC: the legal name). */
describe("the public site footer", () => {
  it("says who runs makam.co.id, from Pengaturan Operator rather than a constant", () => {
    const markup = renderToStaticMarkup(
      createElement(SiteFooter, { legalName: "PT Jaya Korpora Prima", year: 2026 }),
    );
    expect(markup).toContain("Makam.co.id dikelola oleh PT Jaya Korpora Prima");
  });

  it("claims nothing about who runs it before Pengaturan Operator holds a name", () => {
    const markup = renderToStaticMarkup(createElement(SiteFooter, { legalName: null, year: 2026 }));
    expect(markup).toContain("Makam.co.id");
    expect(markup).not.toMatch(/dikelola oleh/);
  });

  it("lists the content pages as a named nav, and links each one", () => {
    const markup = renderToStaticMarkup(
      createElement(SiteFooter, { legalName: "PT Jaya Korpora Prima", year: 2026 }),
    );
    expect(markup).toMatch(/<nav[^>]*aria-label="Halaman isi"/);
    for (const href of ["/tentang-kami", "/cara-kami-bekerja", "/faq", "/hubungi-kami", "/lokasi"]) {
      expect(markup).toContain(`href="${href}"`);
    }
  });

  it("shows the year it was asked for, not the machine's clock", () => {
    const markup = renderToStaticMarkup(createElement(SiteFooter, { legalName: null, year: 2026 }));
    expect(markup).toContain("2026");
  });
});
