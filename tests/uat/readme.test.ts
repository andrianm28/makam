import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/*
 * The runner refuses a stack that does not say it is development, test or staging, before any journey
 * (uat/support/pra-uji.ts). The person who sees "UAT ditolak" reads the README to learn why, so it says so.
 */

const readme = readFileSync(path.join(process.cwd(), "uat/README.md"), "utf8");

describe("the UAT README explains the refusal before any journey", () => {
  it("says the stack at the base URL is asked on /api/health which environment it is", () => {
    expect(readme).toContain("/api/health");
    expect(readme).toMatch(/environment/i);
  });

  it("says only development, test and staging pass", () => {
    for (const nama of ["development", "test", "staging"]) expect(readme, `README tidak menyebut ${nama}`).toContain(nama);
  });

  it("says a stack that answers production is refused, also on a loopback port of the production host", () => {
    expect(readme).toMatch(/production/);
    expect(readme).toMatch(/127\.0\.0\.1:3100|loopback|port lokal/i);
  });

  it("says no answer, an unreadable answer or an unknown environment is refused as well (it fails closed)", () => {
    expect(readme).toMatch(/tidak menjawab|tanpa jawaban|no answer/i);
    expect(readme).toMatch(/tidak dikenal|unknown/i);
  });

  it("says what the refusal looks like, so it can be recognised", () => {
    expect(readme).toContain("UAT ditolak");
  });
});
