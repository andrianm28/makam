import { readFileSync } from "node:fs";

/**
 * The colour tokens of the design system, read straight from
 * `src/app/globals.css` (docs/design-system.md), so the Katalog Desain page
 * can never drift from the tokens components actually use: it re-reads and
 * re-parses the file on every request rather than keeping a copy of the
 * values.
 */

const GLOBALS_CSS_PATH = "src/app/globals.css";

type Rgb = [number, number, number];

export interface ColorToken {
  name: string;
  hex: string;
  oklch: string;
}

export interface DesignTokens {
  /** Every colour token declared in `:root`, in file order. */
  light: ColorToken[];
  /** Only the tokens `.dark` overrides (staff area dark mode), in file order. */
  dark: ColorToken[];
}

/** The custom properties declared directly in one top-level block (`:root`, `.dark`). */
function declarations(css: string, selector: string): Map<string, string> {
  const source = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const start = source.search(new RegExp(`(^|\\n)\\s*${escaped}\\s*\\{`));
  if (start < 0) return new Map();
  const open = source.indexOf("{", start);
  // The block ends at its own closing brace, not at the first nested one.
  let depth = 0;
  let close = open;
  for (; close < source.length; close++) {
    if (source[close] === "{") depth++;
    else if (source[close] === "}" && --depth === 0) break;
  }
  const tokens = new Map<string, string>();
  for (const match of source.slice(open + 1, close).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    tokens.set(match[1], match[2].trim());
  }
  return tokens;
}

/** A token's value as sRGB (0-1), following `var(--other)` references; null when it is not an opaque colour. */
function resolveColour(tokens: Map<string, string>, name: string): Rgb | null {
  let value = tokens.get(name);
  for (let hops = 0; value?.startsWith("var("); hops++) {
    if (hops > 10) return null;
    const match = /var\(--([\w-]+)\)/.exec(value);
    value = match ? tokens.get(match[1]) : undefined;
  }
  if (!value) return null;
  return parseColour(value);
}

function parseColour(value: string): Rgb | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255) as Rgb;
  // Alpha (a "/ 0.2" tail) is dropped: the swatch shows the colour itself, not its opacity.
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.%]+\s*)?\)$/.exec(value);
  if (oklch) return oklchToSrgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
  return null;
}

/** CSS Color 4's OKLCH -> sRGB, gamut-clipped. */
function oklchToSrgb(l: number, c: number, h: number): Rgb {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return linear.map((v) => {
    const x = Math.min(1, Math.max(0, v));
    return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
  }) as Rgb;
}

/** sRGB (0-1) -> CSS Color 4's OKLCH, the inverse of `oklchToSrgb`. */
function srgbToOklch(rgb: Rgb): { l: number; c: number; h: number } {
  const linear = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const [r, g, b] = linear;
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const l = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(a * a + bb * bb);
  const h = c < 0.0001 ? 0 : (Math.atan2(bb, a) * 180) / Math.PI;
  return { l, c, h: h < 0 ? h + 360 : h };
}

function hex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function oklchString(rgb: Rgb): string {
  const { l, c, h } = srgbToOklch(rgb);
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${h.toFixed(1)})`;
}

/**
 * The colour tokens declared in the CSS text of `globals.css`: every one that
 * resolves to an opaque colour, in the order the file declares them (which
 * groups them the way `docs/design-system.md` does: brand palette, roles,
 * semantic, neutrals, the Antrean deadline bar, charts). `dark` lists only
 * the tokens `.dark` itself overrides.
 */
export function parseDesignTokens(css: string): DesignTokens {
  const light = declarations(css, ":root");
  const dark = declarations(css, ".dark");

  const swatch = (tokens: Map<string, string>, name: string): ColorToken | null => {
    const rgb = resolveColour(tokens, name);
    return rgb ? { name, hex: hex(rgb), oklch: oklchString(rgb) } : null;
  };

  const lightTokens = [...light.keys()].flatMap((name) => {
    const token = swatch(light, name);
    return token ? [token] : [];
  });
  const darkTokens = [...dark.keys()].flatMap((name) => {
    const token = swatch(new Map([...light, ...dark]), name);
    return token ? [token] : [];
  });

  return { light: lightTokens, dark: darkTokens };
}

/** The colour tokens as they stand in the repo's `globals.css` right now. */
export function designTokensAtRequestTime(): DesignTokens {
  return parseDesignTokens(readFileSync(GLOBALS_CSS_PATH, "utf8"));
}
