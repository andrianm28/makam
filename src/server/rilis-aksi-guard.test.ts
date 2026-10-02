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

/** The top-level functions of a file: name -> its text (up to the next top-level declaration). */
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
  if (/\bgerbangAksi\(|\bguarded\(\{\s*(?:\/\/[^\n]*\n\s*)*fitur\b/.test(body)) return true;
  return [...fns.keys()].some((other) => other !== name && new RegExp(`\\b${other}\\(`).test(body) && hasRelease(other, fns, seen));
}

describe("Release gate guard for Server Actions (ADR 0006)", () => {
  it("every exported action of every \"use server\" file has a release, so no action runs for a closed feature", () => {
    const sansRilis: string[] = [];
    for (const file of files(srcDir)) {
      const source = readFileSync(file, "utf8");
      if (!/^["']use server["']/m.test(source.slice(0, 200))) continue;
      const fns = topLevel(source);
      for (const [name, body] of fns) {
        if (!body.startsWith("export async function")) continue;
        if (!hasRelease(name, fns)) sansRilis.push(`${relative(srcDir, file)}: ${name}`);
      }
    }
    expect(sansRilis).toEqual([]);
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
