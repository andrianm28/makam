import { describe, expect, it } from "vitest";
import { normalisePhoneNumber } from "./index";

describe("WhatsApp number normalisation (one number, one account)", () => {
  it.each([
    "081234567890",
    "6281234567890",
    "+6281234567890",
    "+62 812-3456-7890",
    "0812 3456 7890",
    "(0812) 3456.7890",
    "81234567890",
  ])("reads %s as +6281234567890", (typed) => {
    expect(normalisePhoneNumber(typed)).toEqual({ ok: true, phoneNumber: "+6281234567890" });
  });

  it("keeps a number from another country written with its + prefix", () => {
    expect(normalisePhoneNumber("+60 12-345 6789")).toEqual({ ok: true, phoneNumber: "+60123456789" });
  });

  it.each([
    ["", "empty"],
    ["0812", "too short"],
    ["08123456789012345", "too long"],
    ["021 5551234", "a Jakarta landline, which has no WhatsApp"],
    ["0812abc34567", "letters"],
    ["+0812345678", "no country code"],
  ])("rejects %s (%s)", (typed) => {
    expect(normalisePhoneNumber(typed)).toEqual({ ok: false, reason: "nomor_tidak_valid" });
  });
});
