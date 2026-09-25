import { describe, expect, it } from "vitest";
import { authenticatorCode, base32Decode, hotp } from "./totp";

/** RFC 6238 Appendix B, SHA-1 rows; the RFC's secret is ASCII "12345678901234567890". */
const RFC_SECRET_BASE32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("the tests' authenticator app (RFC 6238 test vectors)", () => {
  it.each([
    [59, "94287082"],
    [1111111109, "07081804"],
    [1111111111, "14050471"],
    [1234567890, "89005924"],
    [2000000000, "69279037"],
    [20000000000, "65353130"],
  ])("at unix time %i shows %s", (seconds, expected) => {
    expect(authenticatorCode(RFC_SECRET_BASE32, new Date(seconds * 1000), 8)).toBe(expected);
  });

  it("decodes the base32 secret to the RFC's ASCII key", () => {
    expect(base32Decode(RFC_SECRET_BASE32).toString("ascii")).toBe("12345678901234567890");
  });

  it("matches RFC 4226 Appendix D HOTP values", () => {
    const key = Buffer.from("12345678901234567890", "ascii");
    expect(hotp(key, 0, 6)).toBe("755224");
    expect(hotp(key, 9, 6)).toBe("520489");
  });
});
