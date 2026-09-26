import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ticketMentions } from "../../tests/support/copy-scan";

/**
 * Ticket 69: user- and staff-facing copy must never name an internal build
 * ticket (e.g. "Segera hadir (tiket 17)."). Staging is public, so this text
 * is visible to anyone outside the build team.
 */
const APP_DIR = __dirname;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    if (!/\.(ts|tsx)$/.test(entry.name)) return [];
    if (/\.test\.(ts|tsx)$/.test(entry.name)) return [];
    return [full];
  });
}

describe("no internal ticket numbers in user-facing copy", () => {
  it("no string or JSX text in a non-test src/app file names a ticket", () => {
    const violations = sourceFiles(APP_DIR).flatMap((file) =>
      ticketMentions(readFileSync(file, "utf8"), file).map(
        (m) => `${relative(APP_DIR, file)}:${m.line}: ${m.text}`,
      ),
    );
    expect(violations).toEqual([]);
  });
});
