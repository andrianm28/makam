import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./site-footer";

const contact = { whatsApp: "+628112222333", replyHours: "dibalas setiap hari, 06.00–22.00 WIB" };

/** The public site's footer (spec, Public site and routing decisions; AC: the legal name). */
describe("the public site footer", () => {
  it("says who runs makam.co.id, from Pengaturan Operator rather than a constant", () => {
    const markup = renderToStaticMarkup(
      createElement(SiteFooter, { legalName: "PT Jaya Korpora Prima", contact }),
    );
    expect(markup).toContain("Makam.co.id dikelola oleh PT Jaya Korpora Prima");
  });

  it("claims nothing about who runs it before Pengaturan Operator holds a name", () => {
    const markup = renderToStaticMarkup(createElement(SiteFooter, { legalName: null, contact }));
    expect(markup).toContain("Makam.co.id");
    expect(markup).not.toMatch(/dikelola oleh/);
  });

  it("lists the content pages as a named nav, and links each one", () => {
    const markup = renderToStaticMarkup(
      createElement(SiteFooter, { legalName: "PT Jaya Korpora Prima", contact }),
    );
    expect(markup).toMatch(/<nav[^>]*aria-label="Halaman isi"/);
    for (const href of ["/tentang-kami", "/cara-kami-bekerja", "/faq", "/hubungi-kami", "/lokasi"]) {
      expect(markup).toContain(`href="${href}"`);
    }
  });

  it("offers the CS under Bantuan, and nothing there before Pengaturan Operator holds a number", () => {
    const withCs = renderToStaticMarkup(createElement(SiteFooter, { legalName: null, contact }));
    expect(withCs).toContain('href="https://wa.me/628112222333"');
    expect(withCs).toContain("dibalas setiap hari");
    const without = renderToStaticMarkup(createElement(SiteFooter, { legalName: null, contact: null }));
    expect(without).not.toContain("wa.me");
    expect(without).not.toContain("Bantuan");
  });
});
