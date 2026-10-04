import { describe, expect, it } from "vitest";
import { emailPersona, punyaPersona } from "../../uat/support/persona";

/*
 * A journey that needs a persona the owner did not provide (the Mitra Jasa alias, say) skips and says which variable to
 * set, instead of failing on the missing email in the middle of a run.
 */
describe("a persona of the UAT run", () => {
  it("is present when the environment holds its email, however it is padded", () => {
    expect(punyaPersona("mitra-jasa", { UAT_EMAIL_MITRA_JASA: "  owner+mitra@gmail.com " })).toBe(true);
  });

  it("is absent when its variable is missing or blank, and asking for its email then names the variable to set", () => {
    expect(punyaPersona("mitra-jasa", {})).toBe(false);
    expect(punyaPersona("mitra-jasa", { UAT_EMAIL_MITRA_JASA: "   " })).toBe(false);
    expect(() => emailPersona("mitra-jasa", {})).toThrow(/UAT_EMAIL_MITRA_JASA/);
  });

  it("does not take another persona's variable for its own", () => {
    expect(punyaPersona("pemesan", { UAT_EMAIL_MITRA_JASA: "owner+mitra@gmail.com" })).toBe(false);
  });
});
