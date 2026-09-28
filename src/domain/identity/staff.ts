import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, inArray, isNotNull, lte, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import { lokasiMitraResource, staffRoles, stafResource, writeRefusal, type Actor, type Role, type StaffRole } from "./authorize";
import { placeholderEmailFor, verifiedEmailIs, type Account } from "./akun-lookup";
import { normaliseEmail } from "./email-address";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identityAdminLokasi, identitySession, identityStaffRole, identityTotp, identityUser } from "./schema";

export interface StaffAccount {
  accountId: string;
  /** The name as the Akun carries it, empty on an Akun that has never set one. */
  name: string;
  /** The email on record: its Email Terverifikasi, or (an Akun from before ADR 0004) one only typed in. */
  email: string | null;
  /** False for an Akun from before ADR 0004 without an Email Terverifikasi: it cannot log in until a Pemulihan Akun. */
  emailTerverifikasi: boolean;
  /** The phone number, a contact only. */
  phoneNumber: string | null;
  roles: StaffRole[];
  deactivated: boolean;
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

/** The Lokasi Mitra an Akun is Admin Lokasi of, oldest link first. */
export async function adminLokasiIdsOf(db: Database, accountId: string): Promise<string[]> {
  const rows = await db
    .select({ lokasiId: identityAdminLokasi.lokasiId })
    .from(identityAdminLokasi)
    .where(eq(identityAdminLokasi.accountId, accountId))
    .orderBy(asc(identityAdminLokasi.grantedAt), asc(identityAdminLokasi.lokasiId));
  return rows.map((row) => row.lokasiId);
}

/** An Admin Lokasi of one Lokasi Mitra. */
export interface AdminLokasiAccount {
  accountId: string;
  email: string | null;
  /** The name on record; empty until an Akun Saya profile or a wizard sets it (the Kontak Siaga shows it when there is one). */
  name: string;
  /** The phone number, a contact only (Kontak Siaga shows it). */
  phoneNumber: string | null;
}

function adminLokasiRows(db: Database, where: SQL | undefined) {
  return db
    .select({
      accountId: identityUser.id,
      email: identityUser.contactEmail,
      name: identityUser.name,
      phoneNumber: identityUser.phoneNumber,
    })
    .from(identityAdminLokasi)
    .innerJoin(identityUser, eq(identityUser.id, identityAdminLokasi.accountId))
    .innerJoin(
      identityStaffRole,
      and(eq(identityStaffRole.accountId, identityAdminLokasi.accountId), eq(identityStaffRole.role, "admin_lokasi")),
    )
    .where(where)
    .orderBy(asc(identityAdminLokasi.grantedAt), asc(identityUser.id));
}

function toAdminLokasiAccount(row: {
  accountId: string;
  email: string | null;
  name: string;
  phoneNumber: string | null;
}): AdminLokasiAccount {
  return { accountId: row.accountId, email: row.email, name: row.name, phoneNumber: row.phoneNumber };
}

/** Every Akun that is Admin Lokasi of this Lokasi Mitra (holding the role), oldest link first. */
export async function adminLokasiOf(deps: { db: Database }, lokasiId: string): Promise<AdminLokasiAccount[]> {
  const rows = await adminLokasiRows(deps.db, eq(identityAdminLokasi.lokasiId, lokasiId));
  return rows.map(toAdminLokasiAccount);
}

/**
 * The Akun if it has been Admin Lokasi of this Lokasi Mitra without a break
 * since `since`, else null. Removal from the Lokasi and Dinonaktifkan both end
 * the link, and an invite afterwards starts a new one, so a link granted no
 * later than `since` that still exists is unbroken.
 */
export async function adminLokasiSince(
  deps: { db: Database },
  accountId: string,
  lokasiId: string,
  since: Date,
): Promise<AdminLokasiAccount | null> {
  const [row] = await adminLokasiRows(
    deps.db,
    and(
      eq(identityAdminLokasi.accountId, accountId),
      eq(identityAdminLokasi.lokasiId, lokasiId),
      lte(identityAdminLokasi.grantedAt, since),
    ),
  );
  return row ? toAdminLokasiAccount(row) : null;
}

export type RemoveAdminLokasiResult =
  | { ok: true }
  | { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "alasan_wajib" | "bukan_admin_lokasi_di_sini" };

/**
 * Admin Platform removes an Admin Lokasi from one Lokasi Mitra: the Akun keeps
 * its other Lokasi and its role (Dinonaktifkan is a separate write). Audited
 * on the Akun with its Lokasi before and after, and the reason.
 */
export async function removeAdminLokasi(
  deps: { db: Database; audit: AuditLog },
  by: Actor,
  input: { lokasiId: string; accountId: string; reason: string },
): Promise<RemoveAdminLokasiResult> {
  const refusal = writeRefusal(by, "lokasi.atur_admin_lokasi", lokasiMitraResource(input.lokasiId));
  if (refusal) return refusal;
  const reason = input.reason.trim();
  if (!reason) return { ok: false, reason: "alasan_wajib" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const before = await adminLokasiIdsOf(tx, input.accountId);
    if (!before.includes(input.lokasiId)) return { ok: false, reason: "bukan_admin_lokasi_di_sini" } as const;
    await tx
      .delete(identityAdminLokasi)
      .where(and(eq(identityAdminLokasi.accountId, input.accountId), eq(identityAdminLokasi.lokasiId, input.lokasiId)));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "staf.lepas_admin_lokasi",
      entity: { kind: "akun", id: input.accountId },
      lokasiId: input.lokasiId,
      before: { lokasiIds: before },
      after: { lokasiIds: before.filter((lokasiId) => lokasiId !== input.lokasiId) },
      reason,
    });
    return { ok: true } as const;
  });
}

export type SeedResult =
  | { ok: true; account: Account }
  | PhoneNumberRejection
  | { ok: false; reason: "email_tidak_valid" | "admin_platform_sudah_ada" };

/**
 * The CLI seed (`npm run seed:admin`): the first Admin Platform, keyed by its
 * email, seeded as its Email Terverifikasi, with a phone number as contact.
 * When an Akun already has that Email Terverifikasi (someone who logged in
 * before), that Akun becomes the Admin Platform. Refused once any Admin
 * Platform exists: every later staff member comes by Undangan Staf. Audited as
 * seed_cli.
 */
export async function seedFirstAdminPlatform(
  deps: { db: Database; clock: Clock; audit: AuditLog },
  input: { email: string; phoneNumber: string },
): Promise<SeedResult> {
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('identity.seed_admin_platform'))`);
    const [existingAdmin] = await tx
      .select({ accountId: identityStaffRole.accountId })
      .from(identityStaffRole)
      .where(eq(identityStaffRole.role, "admin_platform"))
      .limit(1);
    if (existingAdmin) return { ok: false, reason: "admin_platform_sudah_ada" } as const;

    const now = deps.clock.now();
    const [existing] = await tx.select({ id: identityUser.id }).from(identityUser).where(verifiedEmailIs(email)).for("update");
    let accountId = existing?.id;
    if (accountId) {
      await tx.update(identityUser).set({ phoneNumber, updatedAt: now }).where(eq(identityUser.id, accountId));
    } else {
      accountId = randomUUID();
      await tx.insert(identityUser).values({
        id: accountId,
        name: "",
        email: placeholderEmailFor(accountId),
        emailVerified: false,
        phoneNumber,
        contactEmail: email,
        emailVerifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }
    await tx.insert(identityStaffRole).values({ accountId, role: "admin_platform", grantedAt: now });
    await record({
      // No one is signed in at the seed: the entry names the Akun, acting as the seed CLI.
      actor: { accountId, role: "seed_cli" },
      action: "staf.seed_admin_platform",
      entity: { kind: "akun", id: accountId },
      before: null,
      after: { email, emailTerverifikasi: true, phoneNumber, roles: ["admin_platform"] },
      reason: null,
    });
    return { ok: true, account: { id: accountId, email, phoneNumber } } as const;
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
 * Audited with the reason: one Entri Audit, or, for an Admin Lokasi, one per
 * Lokasi Mitra it was Admin Lokasi of (carrying that Lokasi), in the same transaction.
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
    // Its Lokasi Mitra go with the Admin Lokasi role: an invite back names its Lokasi afresh.
    const lokasiIds = await adminLokasiIdsOf(tx, input.accountId);
    await tx.delete(identityAdminLokasi).where(eq(identityAdminLokasi.accountId, input.accountId));
    await tx.delete(identitySession).where(eq(identitySession.userId, input.accountId));
    // A TOTP enrolment belongs to the Admin Platform role: if the Akun is invited back, it enrols afresh.
    await tx.delete(identityTotp).where(eq(identityTotp.accountId, input.accountId));
    const entry = {
      actor: { accountId: by.accountId, role: "admin_platform" as const },
      action: "staf.nonaktifkan" as const,
      entity: { kind: "akun", id: input.accountId },
      before: { deactivated: false, roles, ...(lokasiIds.length > 0 ? { lokasiIds } : {}) },
      after: { deactivated: true, roles: [], ...(lokasiIds.length > 0 ? { lokasiIds: [] } : {}) },
      reason,
    };
    if (lokasiIds.length === 0) {
      await record(entry);
    } else {
      // One entry per Lokasi it was Admin Lokasi of, so that Lokasi's other Admin Lokasi see it in their Audit Log.
      for (const lokasiId of lokasiIds) await record({ ...entry, lokasiId });
    }
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
      name: identityUser.name,
      email: identityUser.contactEmail,
      emailVerifiedAt: identityUser.emailVerifiedAt,
      phoneNumber: identityUser.phoneNumber,
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
      name: user.name,
      email: user.email,
      emailTerverifikasi: Boolean(user.email && user.emailVerifiedAt),
      phoneNumber: user.phoneNumber,
      roles: held,
      // Dinonaktifkan until a new Undangan Staf grants a role again.
      deactivated: held.length === 0,
    };
  });
}

/** Where a Peringatan Staf to an Akun Staf goes: its Email Terverifikasi, its staff roles and its live sessions. */
export interface StaffRecipient {
  accountId: string;
  /** Its Email Terverifikasi; null for an Akun from before ADR 0004 still waiting for a Pemulihan Akun. */
  email: string | null;
  roles: StaffRole[];
  /** Sessions not ended (Keluar, Dinonaktifkan, a new role grant, reset-totp, Pemulihan Akun) nor expired on the Clock. */
  liveSessionIds: string[];
}

/**
 * The Akun Staf behind `accountId` as a message recipient, or null when the
 * Akun holds no staff role (never invited, or Dinonaktifkan) or does not exist.
 */
export async function staffRecipient(
  deps: { db: Database; clock: Clock },
  accountId: string,
): Promise<StaffRecipient | null> {
  const [user] = await deps.db
    .select({ email: identityUser.contactEmail, emailVerifiedAt: identityUser.emailVerifiedAt })
    .from(identityUser)
    .where(eq(identityUser.id, accountId));
  if (!user) return null;
  const roles = (await rolesOf(deps.db, accountId)).filter((role): role is StaffRole => role !== "pemesan");
  if (roles.length === 0) return null;
  const sessions = await deps.db
    .select({ id: identitySession.id })
    .from(identitySession)
    .where(and(eq(identitySession.userId, accountId), gt(identitySession.expiresAt, deps.clock.now())));
  return {
    accountId,
    email: user.email && user.emailVerifiedAt ? user.email : null,
    roles,
    liveSessionIds: sessions.map((session) => session.id),
  };
}

/**
 * One Akun Staf by its id, or null. The narrow read behind a family's own page
 * showing who has taken their order: a name and a contact number, and nothing
 * else about the account.
 */
export async function staffAccountById(
  deps: { db: Database },
  accountId: string,
): Promise<StaffAccount | null> {
  const [user] = await deps.db
    .select({
      id: identityUser.id,
      name: identityUser.name,
      email: identityUser.contactEmail,
      emailVerifiedAt: identityUser.emailVerifiedAt,
      phoneNumber: identityUser.phoneNumber,
    })
    .from(identityUser)
    .where(eq(identityUser.id, accountId));
  if (!user) return null;
  const roles = await deps.db
    .select({ role: identityStaffRole.role })
    .from(identityStaffRole)
    .where(eq(identityStaffRole.accountId, accountId));
  const held = staffRoles.filter((role) => roles.some((satu) => satu.role === role));
  return {
    accountId: user.id,
    name: user.name,
    email: user.email,
    emailTerverifikasi: Boolean(user.email && user.emailVerifiedAt),
    phoneNumber: user.phoneNumber,
    roles: held,
    // A row here means the Akun is still a member of the staff roster; an
    // Akun that lost every role is Dinonaktifkan and nobody may be handed to it.
    deactivated: held.length === 0,
  };
}
