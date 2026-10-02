import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = join(__dirname, "..");

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Source with its comments blanked (strings and template literals are kept), so a word in a comment never counts. */
export function tanpaKomentar(source: string): string {
  return source.replace(/("(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (match, text) => (text ? match : " "));
}

/** The top-level declarations of a file: name -> its text (up to the next top-level declaration). */
function topLevel(source: string): Map<string, string> {
  const starts = [...source.matchAll(/^(?:export )?(?:async )?function (\w+)|^(?:export )?const (\w+)\s*=/gm)];
  const result = new Map<string, string>();
  starts.forEach((match, index) => {
    const end = starts[index + 1]?.index ?? source.length;
    result.set(match[1] ?? match[2]!, source.slice(match.index, end));
  });
  return result;
}

/** An action has a release when it, or a function of its own file it calls, asks `guarded({ fitur })` or `gerbangAksi`. */
function hasRelease(name: string, fns: Map<string, string>, seen = new Set<string>()): boolean {
  if (seen.has(name)) return false;
  seen.add(name);
  const body = fns.get(name) ?? "";
  if (/\bgerbangAksi\(|\bguarded\(\{\s*fitur\b/.test(body)) return true;
  return [...fns.keys()].some((other) => other !== name && new RegExp(`\\b${other}\\(`).test(body) && hasRelease(other, fns, seen));
}

/**
 * What is wrong with a "use server" file, failing closed: an exported action without a release, and any
 * export form this check does not understand (it cannot prove those have a release).
 */
export function masalahAksi(source: string): string[] {
  const code = tanpaKomentar(source);
  const fns = topLevel(code);
  const masalah: string[] = [];
  for (const [name, body] of fns) {
    if (body.startsWith("export ") && !hasRelease(name, fns)) masalah.push(`${name}: no release`);
  }
  for (const line of code.split("\n")) {
    if (!line.startsWith("export ")) continue;
    if (/^export (async function \w+|const \w+\s*=|type |interface |type\{)/.test(line)) continue;
    if (/^export type \{/.test(line)) continue;
    masalah.push(`unrecognised export form: ${line.trim().slice(0, 60)}`);
  }
  return masalah;
}

describe("Release gate guard for Server Actions (ADR 0006)", () => {
  it("every exported action of every \"use server\" file has a release, so no action runs for a closed feature", () => {
    const sansRilis: string[] = [];
    for (const file of files(srcDir)) {
      const source = readFileSync(file, "utf8");
      if (!/^["']use server["']/m.test(source.slice(0, 200))) continue;
      for (const masalah of masalahAksi(source)) sansRilis.push(`${relative(srcDir, file)}: ${masalah}`);
    }
    expect(sansRilis).toEqual([]);
  });

  it("fails closed on an action without a release, whatever its export form", () => {
    expect(masalahAksi('"use server";\nexport const x = async () => guarded({ action: "a" });')).toEqual(["x: no release"]);
    expect(masalahAksi('"use server";\nexport const x = async () => guarded({ fitur: "inti", action: "a" });')).toEqual([]);
    expect(masalahAksi('"use server";\nexport async function y() { return 1; }')).toEqual(["y: no release"]);
    expect(masalahAksi('"use server";\nexport async function y() {\n  // gerbangAksi("tpu") later\n  /* guarded({ fitur: "x" }) */\n  return 1;\n}')).toEqual(["y: no release"]);
    for (const bentuk of ["export { a as b };", "export * from './x';", "export default async function () {}", "export function sync() {}"]) {
      expect(masalahAksi(`"use server";\n${bentuk}`), bentuk).toEqual([expect.stringContaining("unrecognised export form")]);
    }
    expect(masalahAksi('"use server";\nexport type Z = string;')).toEqual([]);
  });

  it("every call of guarded() names its release", () => {
    const tanpa: string[] = [];
    for (const file of files(srcDir)) {
      if (file.endsWith("guard.ts")) continue;
      const source = readFileSync(file, "utf8");
      for (const match of source.matchAll(/\bguarded\(\{/g)) {
        const after = source.slice(match.index + match[0].length, match.index + match[0].length + 200);
        if (!/^\s*fitur\b/.test(after)) tanpa.push(`${relative(srcDir, file)}@${match.index}`);
      }
    }
    expect(tanpa).toEqual([]);
  });
});
