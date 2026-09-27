import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { publicMenu } from "@/lib/public-navigation";
import { SiteHeader } from "./site-header";

/** The public site's top bar (spec, Public site and routing decisions). */
const items = publicMenu({ signedIn: false });
const contact = { whatsApp: "+628112222333", replyHours: "dibalas mulai pukul 06:00" };

function header(props: Parameters<typeof SiteHeader>[0]): string {
  return renderToStaticMarkup(createElement(SiteHeader, props));
}

describe("the top bar", () => {
  it("is the logo home, the menu, and a way to the CS", () => {
    const markup = header({ items, contact });
    expect(markup).toContain('href="/"');
    expect(markup).toMatch(/<nav[^>]*aria-label="Menu utama"/);
    expect(markup).toContain('href="https://wa.me/628112222333"');
    // The whole menu is in the bar from md up; on a phone the drawer takes it, and
    // the CS link stays one tap away as an icon with its label for assistive tech.
    expect(markup).toMatch(/aria-label="Buka menu"/);
    expect(markup).toContain("sr-only sm:not-sr-only");
  });

  it("lists every menu item, the signed-out one included", () => {
    const markup = header({ items, contact });
    for (const item of items) expect(markup).toContain(item.label);
    expect(markup).toContain("Masuk");
  });

  it("still stands up, without a CS link, before Pengaturan Operator holds a number", () => {
    const markup = header({ items, contact: null });
    expect(markup).not.toContain("wa.me");
    expect(markup).toContain("Masuk");
  });

  it("offers Akun Saya to a signed-in visitor instead of Masuk", () => {
    const markup = header({ items: publicMenu({ signedIn: true }), contact });
    expect(markup).toContain("Akun Saya");
    expect(markup).not.toContain("Masuk");
  });
});
