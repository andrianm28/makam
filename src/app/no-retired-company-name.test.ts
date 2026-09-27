import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { copyMentions, copyScanDirs } from "../../tests/support/copy-scan";
import { sourceFiles } from "../../tests/support/source-files";

/**
 * YIEM has left the product (ADR 0001, amended 2026-09-25: the Operator,
 * PT Jaya Korpora Prima, is the seller of record). The name must not appear in
 * any copy a page can render — the written content pages most of all, where the
 * Operator is described in full.
 *
 * Every string and JSX text a page can render is read here, through the same copy
 * scan that keeps ticket numbers out, so a comment or a regex is never mistaken
 * for copy while a rendered word is caught. The scan covers the pages, the shared
 * components **and `src/lib`**: the public site's own copy is written there
 * (`content-pages.ts`, `homepage-content.ts`) and imported by a page, so a guard
 * limited to `src/app` would go green without reading a single paragraph of it.
 */
const SRC_DIR = join(__dirname, "..");

/** The name that must not reach a screen, in the spelling we would have used. */
const YIEM = /\bYIEM\b/;

describe("no retired company name in rendered copy", () => {
  it("no string or JSX text in a non-test file a page can render from names it", () => {
    const violations = copyScanDirs(SRC_DIR)
      .flatMap((dir) => sourceFiles(dir))
      .flatMap((file) =>
        copyMentions(readFileSync(file, "utf8"), file, YIEM).map(
          (mention) => `${relative(SRC_DIR, file)}:${mention.line}: ${mention.text}`,
        ),
      );
    expect(violations).toEqual([]);
  });

  it("reads the public site's own copy, not only the pages that render it", () => {
    // The guard above is only worth anything if it sees these two files; if a
    // future change narrows the scan back to src/app, this fails first.
    const files = copyScanDirs(SRC_DIR).flatMap((dir) => sourceFiles(dir));
    expect(files).toContain(join(SRC_DIR, "lib", "content-pages.ts"));
    expect(files).toContain(join(SRC_DIR, "lib", "homepage-content.ts"));
  });
});
