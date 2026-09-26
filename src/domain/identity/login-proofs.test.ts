import { describe, expect, it } from "vitest";
import { LoginProofs } from "./login-proofs";

/*
 * The one-time proof the identity module hands Better Auth after it checked a
 * Kode Masuk itself (./login.ts). Every public login path is covered in
 * otp-login.test.ts and email-login.test.ts; this covers what no public path
 * can reach: a sign-in that fails before Better Auth consumes its proof.
 */
describe("a login proof", () => {
  it("lives only during its sign-in: afterwards it signs no one in, even when the sign-in threw before using it", async () => {
    const proofs = new LoginProofs();
    let unused = "";

    await expect(
      proofs.during("+6281234567890", async (proof) => {
        unused = proof;
        throw new Error("Better Auth failed before its hook ran");
      }),
    ).rejects.toThrow("Better Auth failed");

    expect(proofs.consume("+6281234567890", unused)).toBe(false);
  });

  it("works once, and only for its own number", async () => {
    const proofs = new LoginProofs();

    await proofs.during("+6281234567890", async (proof) => {
      expect(proofs.consume("+6281234567890", proof)).toBe(true);
      expect(proofs.consume("+6281234567890", proof)).toBe(false);
    });
    await proofs.during("+6281234567890", async (proof) => {
      expect(proofs.consume("+6289999999999", proof)).toBe(false);
      expect(proofs.consume("+6281234567890", proof)).toBe(false);
    });
  });
});
