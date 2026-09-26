/**
 * The key wrong Kode Masuk count and lock under (decision Q10, ticket 67): an
 * Akun across every channel, or a WhatsApp number while it has no Akun yet.
 */
export type LockKey = `akun:${string}` | `wa:${string}`;

/** The lock key of an Akun: its wrong codes on every channel count together. */
export function akunLockKey(accountId: string): LockKey {
  return `akun:${accountId}`;
}

/** The lock key a WhatsApp code to `phoneNumber` counts under: its Akun's, or the number's own while it has none. */
export function numberLockKey(phoneNumber: string, akun: { id: string } | null): LockKey {
  return akun ? akunLockKey(akun.id) : `wa:${phoneNumber}`;
}

/** The Akun a lock key names, or null for a number's own key. */
export function accountIdOfLockKey(key: string): string | null {
  return key.startsWith("akun:") ? key.slice("akun:".length) : null;
}
