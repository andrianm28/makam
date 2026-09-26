import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { designTokensAtRequestTime, parseDesignTokens } from "./design-tokens";

/**
 * The Katalog Desain page reads its colour tokens from `globals.css` at
 * request time rather than keeping a copy, so it can never drift from what
 * components actually use. `parseDesignTokens` is the pure parser this is
 * built on; these tests prove it reflects the CSS text handed to it, not a
 * hardcoded table.
 */

describe("parseDesignTokens", () => {
  const css = `
    :root {
      --forest: #29483a;
      --brand: var(--forest);
      --brand-soft: oklch(0.93 0.018 158);
    }
    .dark {
      --brand: oklch(0.78 0.045 160);
    }
  `;

  it("reads a hex token as itself, in both hex and oklch", () => {
    const { light } = parseDesignTokens(css);
    const forest = light.find((token) => token.name === "forest");
    expect(forest?.hex).toBe("#29483A");
    expect(forest?.oklch).toMatch(/^oklch\(0\.\d+ 0\.\d+ \d+\.\d\)$/);
  });

  it("follows a var() reference to its resolved colour", () => {
    const { light } = parseDesignTokens(css);
    expect(light.find((token) => token.name === "brand")?.hex).toBe("#29483A");
  });

  it("lists only the tokens .dark itself overrides, resolved against the light values", () => {
    const { dark } = parseDesignTokens(css);
    expect(dark.map((token) => token.name)).toEqual(["brand"]);
    expect(dark[0].hex).not.toBe("#29483A");
  });

  it("changes with the CSS text handed to it: it is not a hardcoded copy of the tokens", () => {
    const changed = css.replace("#29483a", "#112233");
    expect(parseDesignTokens(css).light.find((token) => token.name === "forest")?.hex).toBe("#29483A");
    expect(parseDesignTokens(changed).light.find((token) => token.name === "forest")?.hex).toBe("#112233");
  });

  it("skips a declaration that is not an opaque colour (shadows, unresolved references)", () => {
    const { light } = parseDesignTokens(`:root { --elevation-xs: 0 1px 2px oklch(0.37 0.044 164 / 0.05); --missing: var(--nope); }`);
    expect(light).toEqual([]);
  });

  it("drops an alpha channel rather than failing to parse", () => {
    const { light } = parseDesignTokens(`:root { --overlay: oklch(0.19 0.02 162 / 0.2); }`);
    expect(light[0].name).toBe("overlay");
    expect(light[0].hex).toMatch(/^#[0-9A-F]{6}$/);
  });
});

describe("designTokensAtRequestTime", () => {
  it("reads the real globals.css: the brand palette matches the guideline exactly", () => {
    const { light } = designTokensAtRequestTime();
    const named = (name: string) => light.find((token) => token.name === name)?.hex;
    expect(named("forest")).toBe("#29483A");
    expect(named("sage")).toBe("#8FA99A");
    expect(named("sand")).toBe("#D8C6A5");
    expect(named("ivory")).toBe("#F7F4ED");
    expect(named("charcoal")).toBe("#303330");
  });

  it("is wired to the file on disk, not a copy: it matches a fresh read of globals.css", () => {
    const fresh = parseDesignTokens(readFileSync("src/app/globals.css", "utf8"));
    expect(designTokensAtRequestTime()).toEqual(fresh);
  });
});
