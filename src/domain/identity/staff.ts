import { randomUUID } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import { staffRoles, type Role, type StaffRole } from "./authorize";
import type { Account } from "./login";
import { normalisePhoneNumber, type PhoneNumberResult } from "./phone-number";
import { identityStaffRole, identityUser } from "./schema";

type PhoneNumberRejection = Extract<PhoneNumberResult, { ok: false }>;

export interface StaffAccount {
  accountId: string;
  phoneNumber: string;
  email: string | null;
  roles: StaffRole[];
  deactivated: boolean;
}

const emailSchema = z.email();

/** The email as stored (trimmed, lower-cased), or null when it is not an email. */
export function normaliseEmail(typed: string): string | null {
  const email = typed.trim().toLowerCase();
  return emailSchema.safeParse(email).success ? email : null;
}

/** The undeliverable placeholder Better Auth needs as its unique user email. */
export function placeholderEmailFor(phoneNumber: string): string {
  return `${phoneNumber.replace(/^\+/, "")}@wa.makam.invalid`;
}

/** Every role an Akun holds: Pemesan first, then its staff roles in a fixed order. */
export async function rolesOf(db: Database, accountId: string): Promise<Role[]> {
  const rows = await db
    .select({ role: identityStaffRole.role })
    .from(identityStaffRole)
    .where(eq(identityStaffRole.accountId, accountId));
  const held = new Set(rows.map((row) => row.role));
  return ["pemesan", ...staffRoles.filter((role) => held.has(role))];
}

export type SeedResult =
  | { ok: true; account: Account }
  | PhoneNumberRejection
  | { ok: false; reason: "email_tidak_valid" | "admin_platform_sudah_ada" };

/**
 * The CLI seed (`npm run seed:admin`): creates the first Admin Platform with
 * its WhatsApp number and email. Refused once any Admin Platform exists; every
 * later staff member comes by Undangan Staf.
 */
export async function seedFirstAdminPlatform(
  deps: { db: Database; clock: Clock },
  input: { phoneNumber: string; email: string },
): Promise<SeedResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };

  return deps.db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('identity.seed_admin_platform'))`);
    const [existingAdmin] = await tx
      .select({ accountId: identityStaffRole.accountId })
      .from(identityStaffRole)
      .where(eq(identityStaffRole.role, "admin_platform"))
      .limit(1);
    if (existingAdmin) return { ok: false, reason: "admin_platform_sudah_ada" } as const;

    const now = deps.clock.now();
    const [existing] = await tx
      .select({ id: identityUser.id })
      .from(identityUser)
      .where(eq(identityUser.phoneNumber, phoneNumber));
    let accountId = existing?.id;
    if (accountId) {
      await tx.update(identityUser).set({ contactEmail: email, updatedAt: now }).where(eq(identityUser.id, accountId));
    } else {
      accountId = randomUUID();
      await tx.insert(identityUser).values({
        id: accountId,
        name: "",
        email: placeholderEmailFor(phoneNumber),
        emailVerified: false,
        phoneNumber,
        phoneNumberVerified: false,
        contactEmail: email,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.insert(identityStaffRole).values({ accountId, role: "admin_platform", grantedAt: now });
    return { ok: true, account: { id: accountId, phoneNumber } } as const;
  });
}

/** Every Akun Staf, active or deactivated, oldest first. */
export async function staffAccounts(deps: { db: Database }): Promise<StaffAccount[]> {
  const roles = await deps.db
    .select({ accountId: identityStaffRole.accountId, role: identityStaffRole.role })
    .from(identityStaffRole);
  if (roles.length === 0) return [];
  const byAccount = new Map<string, Set<StaffRole>>();
  for (const { accountId, role } of roles) {
    byAccount.set(accountId, (byAccount.get(accountId) ?? new Set()).add(role));
  }
  const users = await deps.db
    .select({
      id: identityUser.id,
      phoneNumber: identityUser.phoneNumber,
      email: identityUser.contactEmail,
      deactivatedAt: identityUser.deactivatedAt,
    })
    .from(identityUser)
    .where(inArray(identityUser.id, [...byAccount.keys()]))
    .orderBy(asc(identityUser.createdAt), asc(identityUser.id));
  return users.map((user) => ({
    accountId: user.id,
    phoneNumber: user.phoneNumber ?? "",
    email: user.email,
    roles: staffRoles.filter((role) => byAccount.get(user.id)?.has(role)),
    deactivated: user.deactivatedAt !== null,
  }));
}
