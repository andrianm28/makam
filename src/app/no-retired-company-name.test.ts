import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { copyMentions } from "../../tests/support/copy-scan";
import { sourceFiles } from "../../tests/support/source-files";

/**
 * YIEM has left the product (ADR 0001, amended 2026-09-25: the Operator,
 * PT Jaya Korpora Prima, is the seller of record). The name must not appear on
 * any page a visitor reads — the content pages most of all, where the Operator
 * is described in full. Every string and JSX text a page can render is read here
 * through the same copy scan that keeps ticket numbers out, so a comment or a
 * regex is not mistaken for copy but a rendered word is caught.
 */
const APP_DIR = __dirname;
const COMPONENTS_DIR = join(__dirname, "..", "components");
const SRC_DIR = join(__dirname, "..");

/** The name that must not reach a screen, in any spelling we would have used. */
const YIEM = /\bYIEM\b/;

describe("no retired company name in rendered copy", () => {
  it("no string or JSX text in a non-test src/app or src/components file names it", () => {
    const violations = [...sourceFiles(APP_DIR), ...sourceFiles(COMPONENTS_DIR)].flatMap((file) =>
      copyMentions(readFileSync(file, "utf8"), file, YIEM).map(
        (mention) => `${relative(SRC_DIR, file)}:${mention.line}: ${mention.text}`,
      ),
    );
    expect(violations).toEqual([]);
  });
});
