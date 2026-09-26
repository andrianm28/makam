import { readFileSync } from "node:fs";

/**
 * Reads the design tokens from `src/app/globals.css` and measures them the way
 * WCAG 2.2 does, so the brand's contrast promises (docs/design-system.md) are
 * checked against the real token source rather than a copy of it.
 */

export type Theme = "light" | "dark";
type Rgb = [number, number, number];

const GLOBALS_CSS = "src/app/globals.css";

/** The custom properties declared directly in one top-level block (`:root` or `.dark`). */
function declarations(css: string, selector: string): Map<string, string> {
  const start = css.search(new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{`));
  if (start < 0) throw new Error(`no ${selector} block in ${GLOBALS_CSS}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const body = css.slice(open + 1, close).replace(/\/\*[\s\S]*?\*\//g, "");
  const tokens = new Map<string, string>();
  for (const match of body.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) tokens.set(match[1], match[2].trim());
  return tokens;
}

/** Every token's value in one theme: dark overrides the light (`:root`) values. */
export function themeTokens(theme: Theme, css = readFileSync(GLOBALS_CSS, "utf8")): Map<string, string> {
  const light = declarations(css, ":root");
  return theme === "light" ? light : new Map([...light, ...declarations(css, ".dark")]);
}

/** A token's colour as sRGB (0–1), following `var(--other)` references. */
export function tokenColour(tokens: Map<string, string>, name: string): Rgb {
  let value = tokens.get(name);
  for (let hops = 0; value?.startsWith("var("); hops++) {
    if (hops > 10) throw new Error(`--${name} refers to itself`);
    value = tokens.get(/var\(--([\w-]+)\)/.exec(value)![1]);
  }
  if (!value) throw new Error(`no --${name} token`);
  return parseColour(value);
}

function parseColour(value: string): Rgb {
  const hex = /^#([0-9a-f]{6})$/i.exec(value);
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16) / 255) as Rgb;
  const oklch = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/.exec(value);
  if (oklch) return oklchToSrgb(Number(oklch[1]), Number(oklch[2]), Number(oklch[3]));
  throw new Error(`not an opaque hex or oklch colour: ${value}`);
}

/** CSS Color 4's OKLCH → sRGB, gamut-clipped. */
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

export function hex(rgb: Rgb): string {
  return `#${rgb.map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.2 contrast ratio between two colours (1–21). */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
