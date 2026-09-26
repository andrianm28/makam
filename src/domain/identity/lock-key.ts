/**
 * The key wrong codes count and lock under. A Kode Masuk counts under its
 * email: the email is the Akun's key (ADR 0004), so this is the Akun's
 * lockout, and an email with no Akun yet locks the same way. A Verifikasi
 * Email code counts under the signed-in Akun.
 */
export type LockKey = `akun:${string}` | `email:${string}`;

/** The lock key of a Verifikasi Email code of this Akun. */
export function akunLockKey(accountId: string): LockKey {
  return `akun:${accountId}`;
}

/** The lock key of a Kode Masuk to this (normalised) email. */
export function emailLockKey(email: string): LockKey {
  return `email:${email}`;
}
