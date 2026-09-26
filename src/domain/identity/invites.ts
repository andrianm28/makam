import { and, asc, eq, gt, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { EmailSender } from "@/ports/email-sender";
import { staffRoles, stafResource, writeRefusal, type Actor, type StaffRole } from "./authorize";
import type { Account } from "./akun-lookup";
import { normaliseEmail } from "./email-address";
import { undanganStafEmailMessage } from "./email-templates";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identityAdminLokasi, identitySession, identityStaffInvite, identityStaffRole, identityUser } from "./schema";
import { rolesOf } from "./staff";

/** An Undangan Staf stays open for 7 days after it is sent. */
export const STAFF_INVITE_EXPIRES_AFTER_MS = 7 * 86_400_000;

export interface StaffInvite {
  id: string;
  /** Who may accept it: the Akun whose Email Terverifikasi this is. */
  email: string;
  /** The invitee's phone number, a contact only. */
  phoneNumber: string;
  role: StaffRole;
  /** The Lokasi Mitra of an Admin Lokasi invite; null for the other roles. */
  lokasiId: string | null;
  expiresAt: Date;
}

export interface InviteDeps {
  db: Database;
  clock: Clock;
  email: EmailSender;
  audit: AuditLog;
  baseURL: string;
  /** Reports an invite email that could not be sent; gets no address. */
  reportError: (event: string, error: unknown) => void;
}

export type InviteStaffResult =
  | {
      ok: true;
      invite: StaffInvite;
      /** False when the EmailSender did not take the email; the invite stands, and the invitee can still log in. */
      delivered: boolean;
    }
  | PhoneNumberRejection
  | {
      ok: false;
      reason:
        | "tidak_berwenang"
        | "perlu_totp"
        | "email_wajib"
        | "email_tidak_valid"
        /** An Admin Lokasi invite names no Lokasi Mitra. */
        | "lokasi_wajib";
    };

export interface InviteStaffInput {
  /** Who may accept it (required). */
  email: string;
  /** The invitee's phone number, as a contact (required, +62). */
  phoneNumber: string;
  role: StaffRole;
  /**
   * Required for an Admin Lokasi invite: the Lokasi Mitra it is for (the Lokasi
   * module checks it exists, `inviteAdminLokasi`). Ignored for the other roles.
   */
  lokasiId?: string | null;
  reason?: string | null;
}

/**
 * Admin Platform sends an Undangan Staf: a role for an email, with a phone
 * number as contact. The invite is recorded with its Entri Audit in one
 * transaction, then sent to the email through EmailSender. The role is granted
 * when the Akun whose Email Terverifikasi is that email next logs in with a
 * Kode Masuk (which creates the Akun if needed).
 */
export async function inviteStaff(deps: InviteDeps, by: Actor, input: InviteStaffInput): Promise<InviteStaffResult> {
  const refusal = writeRefusal(by, "staf.undang", stafResource());
  if (refusal) return refusal;

  if (input.email.trim() === "") return { ok: false, reason: "email_wajib" };
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;
  const lokasiId = input.role === "admin_lokasi" ? input.lokasiId?.trim() || null : null;
  if (input.role === "admin_lokasi" && !lokasiId) return { ok: false, reason: "lokasi_wajib" };

  const now = deps.clock.now();
  const expiresAt = new Date(now.getTime() + STAFF_INVITE_EXPIRES_AFTER_MS);

  const outcome = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [created] = await tx
      .insert(identityStaffInvite)
      .values({ phoneNumber, email, role: input.role, lokasiId, invitedByAccountId: by.accountId, createdAt: now, expiresAt })
      .returning({ id: identityStaffInvite.id });
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "staf.undang",
      entity: { kind: "undangan_staf", id: created.id },
      lokasiId,
      before: null,
      after: { email, phoneNumber, role: input.role, ...(lokasiId ? { lokasiId } : {}), expiresAt: expiresAt.toISOString() },
      reason: input.reason?.trim() || null,
    });
    return { ok: true, id: created.id } as const;
  });

  let delivered = true;
  try {
    await deps.email.send({ to: email, ...undanganStafEmailMessage({ role: input.role, masukUrl: `${deps.baseURL}/masuk`, expiresAt }) });
  } catch (error) {
    delivered = false;
    deps.reportError("Undangan Staf tidak terkirim", error);
  }

  return { ok: true, invite: { id: outcome.id, email, phoneNumber, role: input.role, lokasiId, expiresAt }, delivered };
}

/**
 * Every Undangan Staf not yet accepted and not expired on the Clock, oldest
 * first; with `lokasiId`, only the Admin Lokasi invites to that Lokasi Mitra.
 */
export async function openStaffInvites(
  deps: { db: Database; clock: Clock },
  filter: { lokasiId?: string } = {},
): Promise<StaffInvite[]> {
  return deps.db
    .select({
      id: identityStaffInvite.id,
      email: identityStaffInvite.email,
      phoneNumber: identityStaffInvite.phoneNumber,
      role: identityStaffInvite.role,
      lokasiId: identityStaffInvite.lokasiId,
      expiresAt: identityStaffInvite.expiresAt,
    })
    .from(identityStaffInvite)
    .where(
      and(
        isNull(identityStaffInvite.acceptedAt),
        gt(identityStaffInvite.expiresAt, deps.clock.now()),
        filter.lokasiId === undefined ? undefined : eq(identityStaffInvite.lokasiId, filter.lokasiId),
      ),
    )
    .orderBy(asc(identityStaffInvite.createdAt));
}

/**
 * On a Kode Masuk login, before its session starts: accepts every open
 * Undangan Staf to the Akun's Email Terverifikasi, granting its role (with an
 * Entri Audit per invite, in the same transaction). A Dinonaktifkan Akun holds
 * a staff role again this way.
 *
 * The strictest session rule holds for the whole Akun: when a role is newly
 * granted, every session the Akun already had (other devices, signed in under
 * the looser rule) ends; the login's own session starts afterwards.
 */
export async function acceptOpenInvites(
  deps: { db: Database; clock: Clock; audit: AuditLog },
  account: Account,
): Promise<void> {
  const now = deps.clock.now();
  await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const open = await tx
      .select()
      .from(identityStaffInvite)
      .where(
        and(
          eq(identityStaffInvite.email, account.email),
          isNull(identityStaffInvite.acceptedAt),
          gt(identityStaffInvite.expiresAt, now),
        ),
      )
      .orderBy(asc(identityStaffInvite.createdAt))
      .for("update");
    // Nothing to accept: nothing is written.
    if (open.length === 0) return { ok: false } as const;

    const heldBefore = (await rolesOf(tx, account.id)).filter((role): role is StaffRole => role !== "pemesan");
    let roles = heldBefore;
    // An Akun with no phone number yet takes the invite's as its contact; one it gave itself is kept.
    const [user] = await tx.select({ phoneNumber: identityUser.phoneNumber }).from(identityUser).where(eq(identityUser.id, account.id));
    let phoneNumber = user?.phoneNumber ?? null;

    for (const invite of open) {
      await tx
        .insert(identityStaffRole)
        .values({ accountId: account.id, role: invite.role, grantedAt: now })
        .onConflictDoNothing();
      await tx
        .update(identityStaffInvite)
        .set({ acceptedAt: now, acceptedAccountId: account.id })
        .where(eq(identityStaffInvite.id, invite.id));
      if (invite.role === "admin_lokasi" && invite.lokasiId) {
        await tx
          .insert(identityAdminLokasi)
          .values({ accountId: account.id, lokasiId: invite.lokasiId, grantedAt: now })
          .onConflictDoNothing();
      }
      const granted = staffRoles.filter((role) => role === invite.role || roles.includes(role));
      const fillsPhoneNumber = phoneNumber === null;
      await record({
        // The invitee's own login accepts the invite; the Admin Platform who sent it is on the staf.undang entry.
        actor: { accountId: account.id, role: "pemesan" },
        action: "staf.peran_diberikan",
        entity: { kind: "akun", id: account.id },
        lokasiId: invite.lokasiId,
        before: { roles, ...(fillsPhoneNumber ? { phoneNumber: null } : {}) },
        after: {
          roles: granted,
          ...(fillsPhoneNumber ? { phoneNumber: invite.phoneNumber } : {}),
          ...(invite.lokasiId ? { lokasiId: invite.lokasiId } : {}),
          undanganStafId: invite.id,
        },
        reason: null,
      });
      roles = granted;
      if (fillsPhoneNumber) phoneNumber = invite.phoneNumber;
    }
    await tx
      .update(identityUser)
      .set({ phoneNumber, deactivatedAt: null, updatedAt: now })
      .where(eq(identityUser.id, account.id));
    if (roles.length > heldBefore.length) {
      await tx.delete(identitySession).where(eq(identitySession.userId, account.id));
    }
    return { ok: true } as const;
  });
}
