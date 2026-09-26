import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { trivyIgnoreProblems } from "./support/trivyignore";

/** Today's date (UTC). An entry that passes today keeps passing: its expiry only gets closer. */
const today = () => new Date().toISOString().slice(0, 10);

describe("the image scan's accepted exceptions (.trivyignore)", () => {
  it("every exception in the repo's .trivyignore has a reason and an expiry date", () => {
    const file = readFileSync(new URL("../.trivyignore", import.meta.url), "utf8");
    expect(trivyIgnoreProblems(file, today())).toEqual([]);
  });

  it("accepts an exception with a reason and an expiry date", () => {
    const file = ["# Reason: no fix in bookworm yet; the app never calls it.", "CVE-2026-12345 exp:2026-12-01", ""].join("\n");
    expect(trivyIgnoreProblems(file, "2026-09-26")).toEqual([]);
  });

  it("refuses an exception without an expiry date", () => {
    const file = ["# Reason: no fix yet.", "CVE-2026-12345"].join("\n");
    expect(trivyIgnoreProblems(file, "2026-09-26")).toEqual(["line 2: CVE-2026-12345 has no expiry (add exp:YYYY-MM-DD)"]);
  });

  it("refuses an exception without a reason comment directly above it", () => {
    const file = ["# Reason: no fix yet.", "CVE-2026-11111 exp:2026-12-01", "CVE-2026-22222 exp:2026-12-01", "", "CVE-2026-33333 exp:2026-12-01"].join("\n");
    expect(trivyIgnoreProblems(file, "2026-09-26")).toEqual([
      "line 3: CVE-2026-22222 has no reason (a # comment on the line above)",
      "line 5: CVE-2026-33333 has no reason (a # comment on the line above)",
    ]);
  });

  it("refuses an expiry that is not a real date", () => {
    const file = ["# Reason: no fix yet.", "CVE-2026-12345 exp:2026-02-30"].join("\n");
    expect(trivyIgnoreProblems(file, "2026-09-26")).toEqual(["line 2: CVE-2026-12345 has an invalid expiry exp:2026-02-30 (use exp:YYYY-MM-DD)"]);
  });

  it("refuses an expiry more than 90 days out", () => {
    const within = ["# Reason: no fix yet.", "CVE-2026-11111 exp:2026-12-25"].join("\n");
    const beyond = ["# Reason: no fix yet.", "CVE-2026-22222 exp:2026-12-26"].join("\n");
    expect(trivyIgnoreProblems(within, "2026-09-26")).toEqual([]);
    expect(trivyIgnoreProblems(beyond, "2026-09-26")).toEqual([
      "line 2: CVE-2026-22222 expires more than 90 days out (exp:2026-12-26; latest allowed 2026-12-25)",
    ]);
  });
});
