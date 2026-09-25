import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  lokasiMitraResource,
  type Actor,
  type AdminLokasiAccount,
  type Identity,
  type InviteStaffResult,
  type RemoveAdminLokasiResult,
  type StaffInvite,
} from "@/domain/identity";
import { isLokasiId, refusalFor, type NotFound, type Refusal } from "./lokasi-mitra";
import { lokasiMitra } from "./schema";

export interface AdminLokasiDeps {
  db: Database;
  identity: Identity;
}

export type InviteAdminLokasiResult = InviteStaffResult | NotFound;

/**
 * Admin Platform invites an Admin Lokasi to one Lokasi Mitra by WhatsApp
 * number and required email (an Undangan Staf carrying the Lokasi). Accepting
 * it at the next OTP login makes the Akun Admin Lokasi there too; every Admin
 * Lokasi of a Lokasi is equal. Only Admin Platform may change which Admin
 * Lokasi a Lokasi has.
 */
export async function inviteAdminLokasi(
  deps: AdminLokasiDeps,
  by: Actor,
  lokasiId: string,
  input: { phoneNumber: string; email: string; reason?: string | null },
): Promise<InviteAdminLokasiResult> {
  const refusal = refusalFor(by, "lokasi.atur_admin_lokasi", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!(await lokasiExists(deps.db, lokasiId))) return { ok: false, reason: "tidak_ditemukan" };
  return deps.identity.inviteStaff(by, { ...input, role: "admin_lokasi", lokasiId });
}

export type RemoveAdminLokasiFromLokasiResult = RemoveAdminLokasiResult | NotFound;

/** Admin Platform removes an Admin Lokasi from this Lokasi Mitra, with a reason, audited. */
export async function removeAdminLokasiFromLokasi(
  deps: AdminLokasiDeps,
  by: Actor,
  lokasiId: string,
  input: { accountId: string; reason: string },
): Promise<RemoveAdminLokasiFromLokasiResult> {
  const refusal = refusalFor(by, "lokasi.atur_admin_lokasi", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!(await lokasiExists(deps.db, lokasiId))) return { ok: false, reason: "tidak_ditemukan" };
  return deps.identity.removeAdminLokasi(by, { lokasiId, ...input });
}

export type AdminLokasiOfResult =
  | { ok: true; adminLokasi: AdminLokasiAccount[]; openInvites: StaffInvite[] }
  | Refusal
  | NotFound;

/** The Admin Lokasi of one Lokasi Mitra, and the open invites to it. */
export async function adminLokasiOfLokasi(
  deps: AdminLokasiDeps,
  by: Actor,
  lokasiId: string,
): Promise<AdminLokasiOfResult> {
  const refusal = refusalFor(by, "lokasi.lihat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!(await lokasiExists(deps.db, lokasiId))) return { ok: false, reason: "tidak_ditemukan" };
  const [adminLokasi, openInvites] = await Promise.all([
    deps.identity.adminLokasiOf(lokasiId),
    deps.identity.openStaffInvites({ lokasiId }),
  ]);
  return { ok: true, adminLokasi, openInvites };
}

async function lokasiExists(db: Database, lokasiId: string): Promise<boolean> {
  if (!isLokasiId(lokasiId)) return false;
  const [row] = await db.select({ id: lokasiMitra.id }).from(lokasiMitra).where(eq(lokasiMitra.id, lokasiId));
  return row !== undefined;
}
