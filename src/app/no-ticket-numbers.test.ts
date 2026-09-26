import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ticket 69: user- and staff-facing copy must never name an internal build
 * ticket (e.g. "Segera hadir (tiket 17)."). Staging is public, so this text
 * is visible to anyone outside the build team.
 */
const APP_DIR = __dirname;
const TICKET_NUMBER = /\btiket\s+\d+/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [full];
  });
}

/** Strips line and block comments while leaving string and template contents untouched. */
function stripComments(source: string): string {
  let out = "";
  let i = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inString: '"' | "'" | "`" | false = false;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (c === "\n") {
        inLineComment = false;
        out += c;
      }
      i += 1;
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 2;
        continue;
      }
      if (c === "\n") out += c;
      i += 1;
      continue;
    }
    if (inString) {
      out += c;
      if (c === "\\") {
        out += next ?? "";
        i += 2;
        continue;
      }
      if (c === inString) inString = false;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      inString = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === "/" && next === "/") {
      inLineComment = true;
      i += 2;
      continue;
    }
    if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

describe("no internal ticket numbers in user-facing copy", () => {
  it("no non-test src/app source file mentions a ticket number outside a comment", () => {
    const violations: string[] = [];
    for (const file of sourceFiles(APP_DIR)) {
      const withoutComments = stripComments(readFileSync(file, "utf8"));
      withoutComments.split("\n").forEach((line, index) => {
        if (TICKET_NUMBER.test(line)) {
          violations.push(`${relative(process.cwd(), file)}:${index + 1}: ${line.trim()}`);
        }
      });
    }
    expect(violations).toEqual([]);
  });
});
