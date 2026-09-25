import { createHmac } from "node:crypto";

/**
 * What an authenticator app shows: an RFC 6238 TOTP code (HMAC-SHA1, 30 s
 * steps) for a base32 secret at an instant. Written independently of the
 * identity module so tests can play the Admin Platform's phone; checked
 * against the RFC's own test vectors in totp.test.ts.
 */
export function authenticatorCode(secretBase32: string, at: Date, digits = 6): string {
  return hotp(base32Decode(secretBase32), Math.floor(at.getTime() / 1000 / 30), digits);
}

export function hotp(key: Buffer, counter: number, digits: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const mac = createHmac("sha1", key).update(message).digest();
  const offset = mac[mac.length - 1] & 0x0f;
  const binary = mac.readUInt32BE(offset) & 0x7fffffff;
  return (binary % 10 ** digits).toString().padStart(digits, "0");
}

export function base32Decode(text: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const clean = text.replace(/=+$/, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error(`not base32: ${char}`);
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}
