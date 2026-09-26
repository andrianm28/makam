import { describe, expect, it } from "vitest";
import { normalisePhoneNumber } from "./index";

describe("phone number normalisation (the Akun's contact)", () => {
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

  it.each([
    ["+65 9123 4567", "Singapore"],
    ["+60 12-345 6789", "Malaysia"],
    ["+1 415 555 2671", "the United States"],
  ])("refuses %s: v1 takes only Indonesian (+62) numbers (%s)", (typed) => {
    expect(normalisePhoneNumber(typed)).toEqual({ ok: false, reason: "nomor_bukan_indonesia" });
  });

  it.each([
    ["", "empty"],
    ["0812", "too short"],
    ["08123456789012345", "too long"],
    ["021 5551234", "a Jakarta landline, not a mobile number"],
    ["0812abc34567", "letters"],
    ["+0812345678", "no country code"],
  ])("rejects %s (%s)", (typed) => {
    expect(normalisePhoneNumber(typed)).toEqual({ ok: false, reason: "nomor_tidak_valid" });
  });
});
