import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trivyIgnoreProblems } from "./support/trivyignore";

describe("the image scan's accepted exceptions (.trivyignore)", () => {
  it("every exception in the repo's .trivyignore has a reason and an expiry date", () => {
    const file = readFileSync(new URL("../.trivyignore", import.meta.url), "utf8");
    expect(trivyIgnoreProblems(file)).toEqual([]);
  });

  it("accepts an exception with a reason and an expiry date", () => {
    const file = ["# Reason: no fix in bookworm yet; the app never calls it.", "CVE-2026-12345 exp:2026-12-31", ""].join("\n");
    expect(trivyIgnoreProblems(file)).toEqual([]);
  });

  it("refuses an exception without an expiry date", () => {
    const file = ["# Reason: no fix yet.", "CVE-2026-12345"].join("\n");
    expect(trivyIgnoreProblems(file)).toEqual(["line 2: CVE-2026-12345 has no expiry (add exp:YYYY-MM-DD)"]);
  });

  it("refuses an exception without a reason comment directly above it", () => {
    const file = ["# Reason: no fix yet.", "CVE-2026-11111 exp:2026-12-31", "CVE-2026-22222 exp:2026-12-31", "", "CVE-2026-33333 exp:2026-12-31"].join("\n");
    expect(trivyIgnoreProblems(file)).toEqual([
      "line 3: CVE-2026-22222 has no reason (a # comment on the line above)",
      "line 5: CVE-2026-33333 has no reason (a # comment on the line above)",
    ]);
  });

  it("refuses an expiry that is not a real date", () => {
    const file = ["# Reason: no fix yet.", "CVE-2026-12345 exp:2026-02-30"].join("\n");
    expect(trivyIgnoreProblems(file)).toEqual(["line 2: CVE-2026-12345 has an invalid expiry exp:2026-02-30 (use exp:YYYY-MM-DD)"]);
  });
});
