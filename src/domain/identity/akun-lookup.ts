import { and, eq, isNotNull, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { identityUser } from "./schema";

/*
 * Finding an Akun by its number or its Email Terverifikasi. Emails are
 * compared lower-cased, as the verified-email index stores them.
 */

/** The Akun keyed by this canonical number, with its Email Terverifikasi (if any). */
export async function akunOfNumber(db: Database, phoneNumber: string) {
  const [row] = await db
    .select({ id: identityUser.id, email: identityUser.contactEmail, emailVerifiedAt: identityUser.emailVerifiedAt })
    .from(identityUser)
    .where(eq(identityUser.phoneNumber, phoneNumber));
  if (!row) return null;
  return { id: row.id, verifiedEmail: row.emailVerifiedAt ? row.email : null };
}

/** The Akun whose Email Terverifikasi this (normalised) email is, or null. */
export async function akunOfVerifiedEmail(db: Database, email: string) {
  const [row] = await db
    .select({ id: identityUser.id, phoneNumber: identityUser.phoneNumber })
    .from(identityUser)
    .where(verifiedEmailIs(email));
  return row?.phoneNumber ? { id: row.id, phoneNumber: row.phoneNumber } : null;
}

/** The number of the Akun `accountId`, while this (normalised) email is its Email Terverifikasi; else null. */
export async function numberOfAkunWithVerifiedEmail(db: Database, accountId: string, email: string) {
  const [row] = await db
    .select({ phoneNumber: identityUser.phoneNumber })
    .from(identityUser)
    .where(and(eq(identityUser.id, accountId), verifiedEmailIs(email)));
  return row?.phoneNumber ?? null;
}

function verifiedEmailIs(email: string) {
  return and(eq(sql`lower(${identityUser.contactEmail})`, email), isNotNull(identityUser.emailVerifiedAt));
}
