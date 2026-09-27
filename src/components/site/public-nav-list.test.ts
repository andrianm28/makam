import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { publicMenu, type PublicMenuItem } from "@/lib/public-navigation";
import { PublicNavList } from "./public-nav-list";

/**
 * The public site's own navigation (spec, Public site and routing decisions):
 * the top bar and the mobile drawer must list the same items, in the same order.
 */
const items: PublicMenuItem[] = publicMenu({ signedIn: false });

/** The labels as the markup reads them: each one where it first appears, in order. */
function labelsInOrder(markup: string, labels: readonly string[]): string[] {
  const found = labels
    .map((label) => ({ label, at: markup.indexOf(label) }))
    .sort((a, b) => a.at - b.at);
  expect(found.every((one) => one.at >= 0)).toBe(true);
  expect(new Set(found.map((one) => one.at)).size).toBe(found.length);
  return found.map((one) => one.label);
}

describe("the public site navigation", () => {
  it("lists the same items, in the same order, in the top bar and in the drawer", () => {
    const bar = renderToStaticMarkup(
      createElement(PublicNavList, { items, pathname: "/", variant: "bar" }),
    );
    const drawer = renderToStaticMarkup(
      createElement(PublicNavList, { items, pathname: "/", variant: "drawer" }),
    );
    const labels = items.map((item) => item.label);

    expect(labelsInOrder(bar, labels)).toEqual(labels);
    expect(labelsInOrder(drawer, labels)).toEqual(labels);
  });

  it("is a list, so the count of its items is announced", () => {
    const markup = renderToStaticMarkup(createElement(PublicNavList, { items, pathname: "/", variant: "bar" }));
    expect((markup.match(/<li/g) ?? []).length).toBe(items.length);
  });

  it("marks the page being read as the current one", () => {
    const markup = renderToStaticMarkup(
      createElement(PublicNavList, { items, pathname: "/lokasi", variant: "bar" }),
    );
    const current = [...markup.matchAll(/<a[^>]*>/g)].map((match) => match[0]);
    expect(current.filter((tag) => tag.includes('aria-current="page"'))).toHaveLength(1);
    expect(current.find((tag) => tag.includes('aria-current="page"'))).toContain('href="/lokasi"');
  });

  it("says an unbuilt page is coming instead of linking to nothing", () => {
    for (const variant of ["bar", "drawer"] as const) {
      const markup = renderToStaticMarkup(
        createElement(PublicNavList, { items, pathname: "/", variant }),
      );
      expect(markup).not.toContain('href="#"');
      for (const item of items.filter((one) => !one.href)) {
        const at = markup.indexOf(item.label);
        const row = markup.slice(markup.lastIndexOf("<li", at), markup.indexOf("</li>", at));
        // No link at all, and a word that says so instead of a date.
        expect(row).not.toContain("<a");
        expect(row).toContain("Segera");
      }
    }
  });
});
