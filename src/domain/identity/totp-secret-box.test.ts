import { describe, expect, it } from "vitest";
import { openTotpSecret, sealTotpSecret } from "./totp-secret-box";

const KEY = Buffer.alloc(32, 7).toString("base64");
const SECRET = "JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP";

describe("an Admin Platform's TOTP secret at rest", () => {
  it("is sealed so that only its own Akun, under TOTP_ENCRYPTION_KEY, opens it", () => {
    const sealed = sealTotpSecret(KEY, "akun-a", SECRET);

    expect(sealed).not.toContain(SECRET);
    expect(openTotpSecret(KEY, "akun-a", sealed)).toBe(SECRET);
  });

  it("a secret sealed for one Akun does not open for another (moved between rows, it is useless)", () => {
    const sealed = sealTotpSecret(KEY, "akun-a", SECRET);

    expect(() => openTotpSecret(KEY, "akun-b", sealed)).toThrow();
  });

  it("does not open under another key", () => {
    const sealed = sealTotpSecret(KEY, "akun-a", SECRET);

    expect(() => openTotpSecret(Buffer.alloc(32, 1).toString("base64"), "akun-a", sealed)).toThrow();
  });
});
