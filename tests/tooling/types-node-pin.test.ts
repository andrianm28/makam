import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Ticket 71, owner decision 2026-10-03: production, staging and CI run the
// Node major named in the Dockerfile, so @types/node must never move past it
// (types for a newer Node would let code use APIs the runtime lacks, failing
// only at runtime). Dependabot is told not to propose major bumps, and the
// declared range is checked against the Dockerfile.
const repo = fileURLToPath(new URL("../..", import.meta.url));
const read = (p: string) => readFileSync(path.join(repo, p), "utf8");

interface Pkg {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/**
 * The `ignore` rules (one text block each) of the `package-ecosystem: npm`
 * entry in dependabot.yml. `yaml` is not a direct dependency, so this assumes
 * the file's layout: entries are `  - package-ecosystem:` at two spaces, the
 * `ignore:` key at four, its rules `      - …` at six. A reformat makes the
 * "has an ignore block" assertion fail, not pass.
 */
function ignoreRules(): string[] {
  const entries = read(".github/dependabot.yml").split(/^ {2}- (?=package-ecosystem:)/m);
  const npm = entries.find((e) => /^package-ecosystem:\s*npm\s*$/m.test(e));
  if (!npm) throw new Error("no npm entry in .github/dependabot.yml");
  const block = npm.match(/^ {4}ignore:\s*\n((?: {6,}.*\n?|\s*#.*\n?)+)/m);
  return block ? block[1]!.split(/^ {6}- /m) : [];
}

/** The major a `package.json` range such as `^22.20.4` declares. */
function declaredMajor(range: string): string {
  const major = range.match(/^[\^~>=\s]*(\d+)/)?.[1];
  if (!major) throw new Error(`cannot read a Node major from the @types/node range "${range}"`);
  return major;
}

/**
 * The one Node major of the Dockerfile's `FROM node:<major>…` lines (the form
 * used today is digest-pinned: `node:22-bookworm-slim@sha256:…`); throws when
 * there is none or when the stages name different majors.
 */
function dockerNodeMajor(dockerfile: string): string {
  const majors = [...new Set([...dockerfile.matchAll(/^FROM node:(\d+)[-.@\s]/gm)].map((m) => m[1]!))];
  if (majors.length === 0) throw new Error("no `FROM node:<major>` line in the Dockerfile");
  if (majors.length > 1) throw new Error(`the Dockerfile's node: stages differ in major: ${majors.join(", ")}`);
  return majors[0]!;
}

describe("@types/node follows the runtime's Node major", () => {
  it("Dependabot's npm entry ignores semver-major updates of @types/node", () => {
    const rules = ignoreRules();
    expect(rules, "npm entry has an ignore block").not.toHaveLength(0);
    const rule = rules.find((r) => /dependency-name:\s*["']?@types\/node["']?\s*$/m.test(r));
    expect(rule, "ignore rule for @types/node").toBeDefined();
    expect(rule).toMatch(/update-types:\s*\[\s*["']version-update:semver-major["']\s*\]/);
  });

  it("package.json's @types/node major equals the Dockerfile's node: major", () => {
    const docker = dockerNodeMajor(read("Dockerfile"));
    const declared = JSON.parse(read("package.json")) as Pkg;
    const range = declared.devDependencies?.["@types/node"] ?? declared.dependencies?.["@types/node"];
    expect(range, "@types/node declared").toBeDefined();
    expect(declaredMajor(range!)).toBe(docker);
  });

  it.each(["22", ">=22", "22.x", "^22.20.4", "~22.0.0", ">= 22.12.0"])("reads the major of the range %s", (range) => {
    expect(declaredMajor(range)).toBe("22");
  });

  it("every FROM node: line of the Dockerfile has to name the same major", () => {
    const stages = "FROM node:22-bookworm-slim AS base\nFROM base AS deps\nFROM node:24-bookworm-slim AS runner\n";
    expect(() => dockerNodeMajor(stages)).toThrow(/22.*24/);
    expect(dockerNodeMajor("FROM node:22-bookworm-slim@sha256:abc AS base\nFROM node:22.12 AS b\n")).toBe("22");
  });
});
