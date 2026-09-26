import { randomBytes } from "node:crypto";

/**
 * One-time login proofs, per identity instance. After the module checked a
 * Kode Masuk itself, it hands Better Auth's phone-number plugin a proof for
 * the Akun's number instead of a code (see ./better-auth.ts). A proof is good
 * once, for its own number, and only while its sign-in runs.
 */
export class LoginProofs {
  readonly #open = new Map<string, string>();

  /** Runs `signIn` with a fresh proof for `phoneNumber`; the proof dies when it ends, however it ends. */
  async during<T>(phoneNumber: string, signIn: (proof: string) => Promise<T>): Promise<T> {
    const proof = randomBytes(32).toString("hex");
    this.#open.set(proof, phoneNumber);
    try {
      return await signIn(proof);
    } finally {
      this.#open.delete(proof);
    }
  }

  /** Better Auth's hook: true once for an open proof of this number; any attempt uses the proof up. */
  consume(phoneNumber: string, proof: string): boolean {
    const owner = this.#open.get(proof);
    this.#open.delete(proof);
    return owner === phoneNumber;
  }
}
