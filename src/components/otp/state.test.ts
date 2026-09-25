import { describe, expect, it } from "vitest";
import { otpMessage } from "./state";

describe("OTP screen messages", () => {
  it("tells a Pemesan with a foreign number to use an Indonesian (+62) WhatsApp number", () => {
    expect(otpMessage("nomor_bukan_indonesia")).toBe("Gunakan nomor WhatsApp Indonesia (+62).");
  });
});
