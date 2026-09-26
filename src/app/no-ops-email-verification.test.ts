import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Ticket 70: marking an Admin Platform's email as Email Terverifikasi without a
 * code is an ops-only path (the `verify-email` CLI). No route, Server Action or
 * page may reach it.
 */
const APP_DIR = __dirname;
const OPS_ONLY = /\bmarkEmailVerifiedByOps\b/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name) || full === __filename) return [];
    return [full];
  });
}

describe("the ops-only email verification stays out of the app", () => {
  it("no file under src/app references markEmailVerifiedByOps", () => {
    const violations = sourceFiles(APP_DIR).flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) => (OPS_ONLY.test(line) ? [`${relative(APP_DIR, file)}:${index + 1}`] : [])),
    );
    expect(violations).toEqual([]);
  });
});
