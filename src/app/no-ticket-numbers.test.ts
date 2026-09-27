import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { copyScanDirs, ticketMentions } from "../../tests/support/copy-scan";
import { sourceFiles } from "../../tests/support/source-files";

/**
 * Ticket 69: user- and staff-facing copy must never name an internal build
 * ticket (e.g. "Segera hadir (tiket 17)."). Staging is public, so this text
 * is visible to anyone outside the build team.
 */
const SRC_DIR = join(__dirname, "..");

describe("no internal ticket numbers in user-facing copy", () => {
  it("no string or JSX text in a non-test file a page can render from names a ticket", () => {
    // The pages, the shared components **and** src/lib: the public site's copy
    // lives in modules a page imports (`content-pages.ts`, `homepage-content.ts`),
    // so a guard that stopped at src/app would pass without reading a word of it.
    const violations = copyScanDirs(SRC_DIR)
      .flatMap((dir) => sourceFiles(dir))
      .flatMap((file) =>
        ticketMentions(readFileSync(file, "utf8"), file).map(
          (mention) => `${relative(SRC_DIR, file)}:${mention.line}: ${mention.text}`,
        ),
      );
    expect(violations).toEqual([]);
  });
});
