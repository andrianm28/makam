import { z } from "zod";

const emailSchema = z.email();

/** The email as stored (trimmed, lower-cased), or null when it is not an email. */
export function normaliseEmail(typed: string): string | null {
  const email = typed.trim().toLowerCase();
  return emailSchema.safeParse(email).success ? email : null;
}
