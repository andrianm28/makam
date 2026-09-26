import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { identityUser } from "./schema";

/*
 * Finding an Akun by its key, its Email Terverifikasi (ADR 0004). Emails are
 * compared lower-cased, as the verified-email index stores them.
 */

/** An Akun as the identity module hands it out. */
export interface Account {
  id: string;
  /** Its Email Terverifikasi, the Akun's key. */
  email: string;
  /** Its phone number: a contact only (E.164), or null until one is given. */
  phoneNumber: string | null;
}

/** The Akun whose Email Terverifikasi this (normalised) email is, or null. */
export async function akunOfVerifiedEmail(db: Database, email: string): Promise<Account | null> {
  const [row] = await db
    .select({ id: identityUser.id, email: identityUser.contactEmail, phoneNumber: identityUser.phoneNumber })
    .from(identityUser)
    .where(verifiedEmailIs(email));
  return row?.email ? { id: row.id, email: row.email, phoneNumber: row.phoneNumber } : null;
}

/** The Akun `accountId` as an Account, or null when it has no Email Terverifikasi (it cannot log in). */
export async function akunById(db: Database, accountId: string): Promise<Account | null> {
  const [row] = await db
    .select({
      id: identityUser.id,
      email: identityUser.contactEmail,
      verifiedAt: identityUser.emailVerifiedAt,
      phoneNumber: identityUser.phoneNumber,
    })
    .from(identityUser)
    .where(eq(identityUser.id, accountId));
  return row?.email && row.verifiedAt ? { id: row.id, email: row.email, phoneNumber: row.phoneNumber } : null;
}

/** The undeliverable placeholder Better Auth needs as its unique user email; never shown, never mailed. */
export function placeholderEmailFor(accountId: string): string {
  return `${accountId}@akun.makam.invalid`;
}

/** The condition "the Akun's Email Terverifikasi is this (normalised) email". */
export function verifiedEmailIs(email: string) {
  return and(eq(sql`lower(${identityUser.contactEmail})`, email), isNotNull(identityUser.emailVerifiedAt));
}
