import { z } from "zod";

/**
 * Unpadded base64url (RFC 4648 §5) that decodes to exactly `length` bytes:
 * the encoding of VAPID keys (env) and of a browser's push keys (Perangkat Push).
 */
export function base64urlBytes(length: number, message = `must decode to ${length} bytes`) {
  return z
    .string()
    .regex(/^[A-Za-z0-9_-]+$/, "must be unpadded base64url")
    .refine((value) => Buffer.from(value, "base64url").length === length, message);
}
