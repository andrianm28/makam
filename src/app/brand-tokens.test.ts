import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, fontStack, hex, themeTokens, tokenColour, type Theme } from "../../tests/support/colour";
import { sourceFiles } from "../../tests/support/source-files";
import { viewport } from "./staf/viewport";

/**
 * The brand tokens in globals.css (docs/design-system.md, from the brand
 * guideline): the five brand colours exactly, the roles built on them, and
 * WCAG 2.2 AA (4.5:1) for every text pair the staff area and public site use.
 */

const light = themeTokens("light");

describe("brand tokens", () => {
  it("carry the brand guideline's five colours exactly", () => {
    expect(
      ["forest", "sage", "sand", "ivory", "charcoal"].map((name) => hex(tokenColour(light, name))),
    ).toEqual(["#29483A", "#8FA99A", "#D8C6A5", "#F7F4ED", "#303330"]);
  });

  it("give Forest the primary role, Sage the secondary, Sand only the highlight, an Ivory page and Charcoal text", () => {
    const role = (name: string) => hex(tokenColour(light, name));
    expect(role("primary")).toBe("#29483A");
    expect(role("secondary")).toBe("#8FA99A");
    expect(role("highlight")).toBe("#D8C6A5");
    expect(role("background")).toBe("#F7F4ED");
    expect(role("foreground")).toBe("#303330");
  });

  it("make the accent (every menu's hover surface) a light Sand tint, never full Sand", () => {
    const accent = tokenColour(light, "accent");
    expect(hex(accent)).not.toBe("#D8C6A5");
    expect(contrast(accent, tokenColour(light, "ivory"))).toBeLessThan(1.1);
  });

  it("put cards and popovers on a warm off-white (#FCFAF5), never pure white", () => {
    expect(hex(tokenColour(light, "card"))).toBe("#FCFAF5");
    expect(hex(tokenColour(light, "popover"))).toBe("#FCFAF5");
  });

  it("set all UI in Plus Jakarta Sans (never a serif fallback), codes in Geist Mono, and Lora only as the serif", () => {
    for (const name of ["sans", "heading"]) {
      const stack = fontStack(name);
      expect(stack[0]).toBe("var(--font-plus-jakarta)");
      expect(stack.at(-1)).toBe("sans-serif");
      expect(stack.some((family) => /serif/i.test(family) && !/sans/i.test(family))).toBe(false);
    }
    expect([fontStack("mono")[0], fontStack("mono").at(-1)]).toEqual(["var(--font-geist-mono)", "monospace"]);
    expect([fontStack("serif")[0], fontStack("serif").at(-1)]).toEqual(["var(--font-lora)", "serif"]);
  });

  it("give the staff app's browser bar the page colour, light and dark", () => {
    const colours = (viewport.themeColor as { media: string; color: string }[]).map((entry) => [entry.media, entry.color.toUpperCase()]);
    expect(colours).toEqual([
      ["(prefers-color-scheme: light)", hex(tokenColour(light, "background"))],
      ["(prefers-color-scheme: dark)", hex(tokenColour(themeTokens("dark"), "background"))],
    ]);
  });

  it("round controls at 10 px and cards at 12 px", () => {
    expect(light.get("radius")).toBe("0.625rem");
  });
});

/** Every text colour on every surface it is used on: [text, background]. */
const textPairs: [string, string][] = [
  ["foreground", "background"],
  ["card-foreground", "card"],
  ["popover-foreground", "popover"],
  ["foreground", "subtle"],
  ["foreground", "muted"],
  ["muted-foreground", "background"],
  ["muted-foreground", "card"],
  ["muted-foreground", "subtle"],
  ["muted-foreground", "muted"],
  ["muted-foreground", "sidebar"],
  ["primary-foreground", "primary"],
  ["primary", "background"],
  ["primary", "card"],
  ["brand-soft-foreground", "brand-soft"],
  ["secondary-foreground", "secondary"],
  ["sage-strong", "background"],
  ["sage-strong", "card"],
  ["accent-foreground", "accent"],
  ["highlight-foreground", "highlight"],
  ["sidebar-foreground", "sidebar"],
  ["sidebar-accent-foreground", "sidebar-accent"],
  ["success-soft-foreground", "success-soft"],
  ["warning-soft-foreground", "warning-soft"],
  ["danger-soft-foreground", "danger-soft"],
  ["info-soft-foreground", "info-soft"],
  ["neutral-soft-foreground", "neutral-soft"],
  ["success-soft-foreground", "card"],
  ["warning-soft-foreground", "card"],
  ["danger-soft-foreground", "card"],
  ["info-soft-foreground", "card"],
  ["success-foreground", "success"],
  ["warning-foreground", "warning"],
  ["danger-foreground", "danger"],
  ["info-foreground", "info"],
];

describe.each<Theme>(["light", "dark"])("WCAG AA contrast, %s theme", (theme) => {
  const tokens = themeTokens(theme);
  it.each(textPairs)("%s on %s is at least 4.5:1", (text, surface) => {
    expect(contrast(tokenColour(tokens, text), tokenColour(tokens, surface))).toBeGreaterThanOrEqual(4.5);
  });
});

/** Lines of UI source matching `pattern`, as "file:line: text". */
function uiSourceMatching(pattern: RegExp): string[] {
  return ["src/app", "src/components"].flatMap(sourceFiles).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .flatMap((line, index) => (pattern.test(line) ? [`${file}:${index + 1}: ${line.trim()}`] : [])),
  );
}

describe("pages and components use the tokens", () => {
  it("no Tailwind palette colour (bg-black/10, text-emerald-700, …) and no raw hex colour", () => {
    const palette =
      /\b(bg|text|border|ring|fill|stroke|outline|from|to|via)-((black|white)(\/\d+)?(?![\w-])|(red|green|amber|yellow|emerald|blue|zinc|neutral|gray|slate|stone|orange|sky|lime|teal|cyan|indigo|violet|purple|pink|rose)-\d+)|#[0-9a-f]{3,8}\b/i;
    // The viewport's own themeColor lines are checked against the tokens above, not against this guard;
    // every other line, in this file and everywhere else, still has to pass.
    const isViewportThemeColor = (line: string) => line.startsWith("src/app/staf/viewport.ts:") && /\bcolor: "#/.test(line);
    expect(uiSourceMatching(palette).filter((line) => !isViewportThemeColor(line))).toEqual([]);
  });

  it("no hard-coded font family: pages use font-sans, font-mono or font-serif", () => {
    expect(uiSourceMatching(/fontFamily|--font-geist-sans/)).toEqual([]);
  });

  it("dim the page behind a sheet or dialog with the overlay token, in both themes", () => {
    for (const theme of ["light", "dark"] as const) expect(themeTokens(theme).get("overlay")).toBeDefined();
  });
});
