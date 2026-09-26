import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrast, hex, themeTokens, tokenColour, type Theme } from "../../tests/support/colour";

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
    const theme = readFileSync("src/app/globals.css", "utf8").match(/@theme inline \{([\s\S]*?)\n\}/)![1];
    const font = (name: string) => new RegExp(`--font-${name}:\\s*([^;]+);`).exec(theme)?.[1];
    expect(font("sans")).toBe("var(--font-plus-jakarta), ui-sans-serif, system-ui, sans-serif");
    expect(font("heading")).toBe(font("sans"));
    expect(font("mono")).toBe("var(--font-geist-mono), ui-monospace, monospace");
    expect(font("serif")).toBe("var(--font-lora), ui-serif, Georgia, serif");
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
