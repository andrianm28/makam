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
  it("is the logo home, the menu, the account button and the drawer's trigger", () => {
    const markup = header({ items, contact });
    expect(markup).toContain('href="/"');
    expect(markup).toMatch(/<nav[^>]*aria-label="Menu utama"/);
    // The account entry is its own outlined button, not a menu item, and the
    // whole menu moves into the drawer below lg (public-site prototype).
    expect(markup).toContain('href="/masuk"');
    expect(markup).toMatch(/aria-label="Buka menu"/);
  });

  it("lists every menu item, the signed-out one included", () => {
    const markup = header({ items, contact });
    for (const item of items) expect(markup).toContain(item.label);
    expect(markup).toContain("Masuk");
  });

  it("still stands up before Pengaturan Operator holds a CS number", () => {
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
