import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Ticket 71, owner decision 2026-10-03: production, staging and CI run the
// Node major named in the Dockerfile, so @types/node must never move past it
// (types for a newer Node would let code use APIs the runtime lacks, failing
// only at runtime). Dependabot is told not to propose major bumps, and the
// declared range is checked against the Dockerfile.
const read = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

/** The text of the `package-ecosystem: npm` entry in dependabot.yml. */
function npmEntry(): string {
  const entries = read(".github/dependabot.yml").split(/^ {2}- (?=package-ecosystem:)/m);
  const entry = entries.find((e) => /^package-ecosystem:\s*npm\s*$/m.test(e));
  if (!entry) throw new Error("no npm entry in .github/dependabot.yml");
  return entry;
}

/** The major a `package.json` range such as `^22.20.4` declares. */
function declaredMajor(range: string): string {
  const major = range.match(/^[\^~>=\s]*(\d+)/)?.[1];
  if (!major) throw new Error(`cannot read a Node major from the @types/node range "${range}"`);
  return major;
}

describe("@types/node follows the runtime's Node major", () => {
  it("Dependabot's npm entry ignores semver-major updates of @types/node", () => {
    const ignore = npmEntry().match(/^ {4}ignore:\s*\n((?: {6,}.*\n?|\s*#.*\n?)+)/m);
    expect(ignore, "npm entry has an ignore block").not.toBeNull();
    const rule = ignore![1]!.split(/^ {6}- /m).find((r) => /dependency-name:\s*["']?@types\/node["']?\s*$/m.test(r));
    expect(rule, "ignore rule for @types/node").toBeDefined();
    expect(rule).toMatch(/update-types:\s*\[\s*["']version-update:semver-major["']\s*\]/);
  });

  it("package.json's @types/node major equals the Dockerfile's node: major", () => {
    const docker = read("Dockerfile").match(/^FROM node:(\d+)[-.@\s]/m);
    expect(docker, "Dockerfile node: base image").not.toBeNull();
    const declared = (JSON.parse(read("package.json")) as { devDependencies?: Record<string, string>; dependencies?: Record<string, string> });
    const range = declared.devDependencies?.["@types/node"] ?? declared.dependencies?.["@types/node"];
    expect(range, "@types/node declared").toBeDefined();
    expect(declaredMajor(range!)).toBe(docker![1]);
  });

  it.each(["22", ">=22", "22.x", "^22.20.4", "~22.0.0", ">= 22.12.0"])("reads the major of the range %s", (range) => {
    expect(declaredMajor(range)).toBe("22");
  });
});
