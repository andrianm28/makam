import { and, asc, eq, gt, isNull, ne } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Clock } from "@/ports/clock";
import type { WhatsAppSender } from "@/ports/whatsapp-sender";
import { staffRoles, stafResource, writeRefusal, type Actor, type StaffRole } from "./authorize";
import { normalisePhoneNumber, type PhoneNumberRejection } from "./phone-number";
import { identityAdminLokasi, identitySession, identityStaffInvite, identityStaffRole, identityUser } from "./schema";
import { normaliseEmail } from "./email-address";
import { rolesOf } from "./staff";

/** An Undangan Staf stays open for 7 days after it is sent. */
export const STAFF_INVITE_EXPIRES_AFTER_MS = 7 * 86_400_000;
/** The WhatsApp template telling the invitee to log in (listed in whatsapp-templates.md). */
export const STAFF_INVITE_TEMPLATE = "staf_undangan";

/**
 * The role as the `staf_undangan` template's first parameter names it
 * (whatsapp-templates.md #43). Message wording, not a screen label: it moves to
 * the Notifications module with this send (ticket 20).
 */
const inviteTemplateRoleNames: Record<StaffRole, string> = {
  admin_platform: "Admin Platform",
  admin_lokasi: "Admin Lokasi",
  petugas_lapangan: "Petugas Lapangan",
  mitra_jasa: "Mitra Jasa",
};

export interface StaffInvite {
  id: string;
  phoneNumber: string;
  email: string;
  role: StaffRole;
  /** The Lokasi Mitra of an Admin Lokasi invite; null for the other roles. */
  lokasiId: string | null;
  expiresAt: Date;
}

export interface InviteDeps {
  db: Database;
  clock: Clock;
  whatsapp: WhatsAppSender;
  audit: AuditLog;
  baseURL: string;
}

export type InviteStaffResult =
  | {
      ok: true;
      invite: StaffInvite;
      /** False when WhatsApp did not take the message; the invite stands, and the invitee can still log in. */
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
  phoneNumber: string;
  email: string;
  role: StaffRole;
  /**
   * Required for an Admin Lokasi invite: the Lokasi Mitra it is for (the Lokasi
   * module checks it exists, `inviteAdminLokasi`). Ignored for the other roles.
   */
  lokasiId?: string | null;
  reason?: string | null;
}

/**
 * Admin Platform sends an Undangan Staf: a role for a WhatsApp number and a
 * required email (every Akun Staf has an email on record; it becomes an Email
 * Terverifikasi only by Verifikasi Email, ticket 67). The invite is recorded
 * with its Entri Audit in one transaction, then announced by WhatsApp. The
 * role is granted when the number next logs in with a Kode Masuk.
 */
export async function inviteStaff(
  deps: InviteDeps,
  by: Actor,
  input: InviteStaffInput,
): Promise<InviteStaffResult> {
  const refusal = writeRefusal(by, "staf.undang", stafResource());
  if (refusal) return refusal;

  const normalised = normalisePhoneNumber(input.phoneNumber);
  if (!normalised.ok) return normalised;
  const { phoneNumber } = normalised;
  if (input.email.trim() === "") return { ok: false, reason: "email_wajib" };
  const email = normaliseEmail(input.email);
  if (!email) return { ok: false, reason: "email_tidak_valid" };
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
      after: { phoneNumber, email, role: input.role, ...(lokasiId ? { lokasiId } : {}), expiresAt: expiresAt.toISOString() },
      reason: input.reason?.trim() || null,
    });
    return { ok: true, id: created.id } as const;
  });

  let delivered = true;
  try {
    await deps.whatsapp.sendTemplate({
      to: phoneNumber,
      template: STAFF_INVITE_TEMPLATE,
      language: "id",
      parameters: [inviteTemplateRoleNames[input.role], `${deps.baseURL}/masuk`],
    });
  } catch {
    delivered = false;
  }

  return { ok: true, invite: { id: outcome.id, phoneNumber, email, role: input.role, lokasiId, expiresAt }, delivered };
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
      phoneNumber: identityStaffInvite.phoneNumber,
      email: identityStaffInvite.email,
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
 * On an OTP login: accepts every open Undangan Staf for the number, granting
 * its role (with an Entri Audit per invite, in the same transaction) and
 * recording its email on the Akun, unverified, unless the Akun already has an
 * Email Terverifikasi, which it keeps. A Dinonaktifkan Akun holds a staff role
 * again this way.
 *
 * The strictest session rule holds for the whole Akun: when a role is newly
 * granted, every other session of the Akun (other devices, signed in under the
 * looser rule) ends; only the login's own session, `sessionToken`, stays.
 */
export async function acceptOpenInvites(
  deps: { db: Database; clock: Clock; audit: AuditLog },
  account: { id: string; phoneNumber: string },
  sessionToken: string,
): Promise<void> {
  const now = deps.clock.now();
  await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const open = await tx
      .select()
      .from(identityStaffInvite)
      .where(
        and(
          eq(identityStaffInvite.phoneNumber, account.phoneNumber),
          isNull(identityStaffInvite.acceptedAt),
          gt(identityStaffInvite.expiresAt, now),
        ),
      )
      .orderBy(asc(identityStaffInvite.createdAt))
      .for("update");
    // Nothing to accept: nothing is written.
    if (open.length === 0) return { ok: false } as const;

    const [user] = await tx
      .select({ email: identityUser.contactEmail, emailVerifiedAt: identityUser.emailVerifiedAt })
      .from(identityUser)
      .where(eq(identityUser.id, account.id));
    let email = user?.email ?? null;
    // A typed email never replaces an Email Terverifikasi (decision Q9, ticket 67); the invite keeps its own.
    const keepsVerifiedEmail = Boolean(user?.email && user.emailVerifiedAt);
    const heldBefore = (await rolesOf(tx, account.id)).filter((role): role is StaffRole => role !== "pemesan");
    let roles = heldBefore;

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
      await record({
        // The invitee's own login accepts the invite; the Admin Platform who sent it is on the staf.undang entry.
        actor: { accountId: account.id, role: "pemesan" },
        action: "staf.peran_diberikan",
        entity: { kind: "akun", id: account.id },
        lokasiId: invite.lokasiId,
        before: { roles, email },
        after: {
          roles: granted,
          email: keepsVerifiedEmail ? email : invite.email,
          ...(invite.lokasiId ? { lokasiId: invite.lokasiId } : {}),
          undanganStafId: invite.id,
        },
        reason: null,
      });
      roles = granted;
      if (!keepsVerifiedEmail) email = invite.email;
    }
    await tx
      .update(identityUser)
      .set({ contactEmail: email, deactivatedAt: null, updatedAt: now })
      .where(eq(identityUser.id, account.id));
    if (roles.length > heldBefore.length) {
      await tx
        .delete(identitySession)
        .where(and(eq(identitySession.userId, account.id), ne(identitySession.token, sessionToken)));
    }
    return { ok: true } as const;
  });
}
