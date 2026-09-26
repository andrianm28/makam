import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ticketMentions } from "../../tests/support/copy-scan";
import { sourceFiles } from "../../tests/support/source-files";

/**
 * Ticket 69: user- and staff-facing copy must never name an internal build
 * ticket (e.g. "Segera hadir (tiket 17)."). Staging is public, so this text
 * is visible to anyone outside the build team.
 */
const APP_DIR = __dirname;
/** The shared components (the staff shell, the makam compositions) carry copy too. */
const COMPONENTS_DIR = join(__dirname, "..", "components");
const SRC_DIR = join(__dirname, "..");

describe("no internal ticket numbers in user-facing copy", () => {
  it("no string or JSX text in a non-test src/app or src/components file names a ticket", () => {
    const violations = [...sourceFiles(APP_DIR), ...sourceFiles(COMPONENTS_DIR)].flatMap((file) =>
      ticketMentions(readFileSync(file, "utf8"), file).map(
        (m) => `${relative(SRC_DIR, file)}:${m.line}: ${m.text}`,
      ),
    );
    expect(violations).toEqual([]);
  });
});
