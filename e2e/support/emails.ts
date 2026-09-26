/** An email that has never been used: no Akun, no Kode Masuk, no orders. */
export function coldEmail(prefix = "pemesan"): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e8).toString(36)}@contoh.id`;
}
