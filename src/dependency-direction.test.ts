import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Pages and actions (src/app) build on everything else, never the other way
 * round: shared code (server helpers, components, lib, domain, ports,
 * adapters) must not import from src/app.
 */
const SRC = __dirname;
const APP = join(SRC, "app");
const SHARED = ["server", "components", "lib", "domain", "ports", "adapters", "composition", "db", "hooks"];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

function importsIntoApp(file: string): string[] {
  const specifiers = [...readFileSync(file, "utf8").matchAll(/\bfrom\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)].map(
    (match) => match[1] ?? match[2],
  );
  return specifiers.filter((specifier) => {
    if (specifier.startsWith("@/app/")) return true;
    if (!specifier.startsWith(".")) return false;
    const target = resolve(join(file, ".."), specifier);
    return target === APP || target.startsWith(`${APP}/`);
  });
}

describe("dependency direction", () => {
  it("no shared module imports from src/app", () => {
    const violations = SHARED.flatMap((dir) => {
      try {
        return sourceFiles(join(SRC, dir));
      } catch {
        return [];
      }
    }).flatMap((file) => importsIntoApp(file).map((specifier) => `${relative(SRC, file)} → ${specifier}`));
    expect(violations).toEqual([]);
  });
});
