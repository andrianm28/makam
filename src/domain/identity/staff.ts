import { randomUUID } from "node:crypto";
import { asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import { staffRoles, stafResource, writeRefusal, type Actor, type Role, type StaffRole } from "./authorize";
import type { Account } from "./login";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identitySession, identityStaffRole, identityTotp, identityUser } from "./schema";

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
  deps: { db: Database; clock: Clock; audit: AuditLog },
  input: { phoneNumber: string; email: string },
): Promise<SeedResult> {
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
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
    await record({
      // No one is signed in at the seed: the entry names the new Akun, acting as the seed CLI.
      actor: { accountId, role: "seed_cli" },
      action: "staf.seed_admin_platform",
      entity: { kind: "akun", id: accountId },
      before: null,
      after: { phoneNumber, email, roles: ["admin_platform"] },
      reason: null,
    });
    return { ok: true, account: { id: accountId, phoneNumber } } as const;
  });
}

export type DeactivateStaffResult =
  | { ok: true }
  | {
      ok: false;
      reason: "tidak_berwenang" | "perlu_totp" | "alasan_wajib" | "bukan_akun_staf" | "akun_sendiri" | "sudah_dinonaktifkan";
    };

/**
 * Admin Platform deactivates an Akun Staf (Dinonaktifkan): every staff role it
 * holds is revoked and its sessions end, so no session of it grants staff
 * access. The Akun itself stays: its number still logs in as a Pemesan, and
 * its orders and Entri Audit remain. A new Undangan Staf can grant a role again.
 * Audited with the reason.
 */
export async function deactivateStaff(
  deps: { db: Database; clock: Clock; audit: AuditLog },
  by: Actor,
  input: { accountId: string; reason: string },
): Promise<DeactivateStaffResult> {
  const refusal = writeRefusal(by, "staf.nonaktifkan", stafResource());
  if (refusal) return refusal;
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "alasan_wajib" };
  if (input.accountId === by.accountId) return { ok: false, reason: "akun_sendiri" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [account] = await tx
      .select({ deactivatedAt: identityUser.deactivatedAt })
      .from(identityUser)
      .where(eq(identityUser.id, input.accountId))
      .for("update");
    const roles = (await rolesOf(tx, input.accountId)).filter((role): role is StaffRole => role !== "pemesan");
    if (account && roles.length === 0 && account.deactivatedAt) return { ok: false, reason: "sudah_dinonaktifkan" } as const;
    if (!account || roles.length === 0) return { ok: false, reason: "bukan_akun_staf" } as const;

    const now = deps.clock.now();
    await tx.update(identityUser).set({ deactivatedAt: now, updatedAt: now }).where(eq(identityUser.id, input.accountId));
    await tx.delete(identityStaffRole).where(eq(identityStaffRole.accountId, input.accountId));
    await tx.delete(identitySession).where(eq(identitySession.userId, input.accountId));
    // A TOTP enrolment belongs to the Admin Platform role: if the Akun is invited back, it enrols afresh.
    await tx.delete(identityTotp).where(eq(identityTotp.accountId, input.accountId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "staf.nonaktifkan",
      entity: { kind: "akun", id: input.accountId },
      before: { deactivated: false, roles },
      after: { deactivated: true, roles: [] },
      reason,
    });
    return { ok: true } as const;
  });
}

/** Every Akun Staf, and every Akun that was one until it was Dinonaktifkan, oldest first. */
export async function staffAccounts(deps: { db: Database }): Promise<StaffAccount[]> {
  const roles = await deps.db
    .select({ accountId: identityStaffRole.accountId, role: identityStaffRole.role })
    .from(identityStaffRole);
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
    .where(
      byAccount.size > 0
        ? or(inArray(identityUser.id, [...byAccount.keys()]), isNotNull(identityUser.deactivatedAt))
        : isNotNull(identityUser.deactivatedAt),
    )
    .orderBy(asc(identityUser.createdAt), asc(identityUser.id));
  return users.map((user) => {
    const held = staffRoles.filter((role) => byAccount.get(user.id)?.has(role));
    return {
      accountId: user.id,
      phoneNumber: user.phoneNumber ?? "",
      email: user.email,
      roles: held,
      // Dinonaktifkan until a new Undangan Staf grants a role again.
      deactivated: held.length === 0,
    };
  });
}
