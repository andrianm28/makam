import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/*
 * An Admin Platform's TOTP secret at rest: AES-256-GCM under
 * TOTP_ENCRYPTION_KEY, as `v1.<iv>.<tag>.<ciphertext>` (each part base64url).
 * The Akun id is the additional authenticated data, so a ciphertext copied to
 * another Akun's row does not open.
 */

/** Seals `secret` for the Akun `accountId`. */
export function sealTotpSecret(keyBase64: string, accountId: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), iv);
  cipher.setAAD(Buffer.from(accountId, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

/** Opens a sealed secret; throws when the key or the Akun is wrong, or the value was altered. */
export function openTotpSecret(keyBase64: string, accountId: string, sealed: string): string {
  const [version, iv, tag, ciphertext] = sealed.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unknown TOTP secret format");
  const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyBase64, "base64"), Buffer.from(iv, "base64url"));
  decipher.setAAD(Buffer.from(accountId, "utf8"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
