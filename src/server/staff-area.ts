import "server-only";
import { redirect } from "next/navigation";
import { authorize, needsTotp, stafMenuResource, staffRoles, type Actor, type Role, type StaffRole } from "@/domain/identity";
import { currentActor } from "./session";

/** The URL segment of each role's menu in the staff area (`/staf/<slug>`). */
export const staffRoleSlugs: Record<StaffRole, string> = {
  admin_platform: "admin-platform",
  admin_lokasi: "admin-lokasi",
  petugas_lapangan: "petugas-lapangan",
  mitra_jasa: "mitra-jasa",
};

/** The staff roles an actor holds, in the fixed order. */
export function heldStaffRoles(roles: Role[]): StaffRole[] {
  return staffRoles.filter((role) => roles.includes(role));
}

/** Where a signed-in actor lands: the TOTP step, the first staff menu, or Akun Saya. */
export function homeFor(actor: Actor): string {
  if (needsTotp(actor)) return "/staf/totp";
  const [first] = heldStaffRoles(actor.roles);
  return first ? `/staf/${staffRoleSlugs[first]}` : "/akun";
}

/**
 * The actor allowed to see `role`'s menu, or a redirect: to Masuk when signed
 * out, to the TOTP step for an Admin Platform who has not passed it, and back
 * to the staff area's start for a role the Akun does not hold.
 */
export async function staffMenuActor(role: StaffRole): Promise<Actor> {
  const actor = await currentActor();
  if (!actor) redirect("/masuk");
  const authorization = authorize(actor, "staf.menu", stafMenuResource(role));
  if (!authorization.allowed) redirect(authorization.reason === "perlu_totp" ? "/staf/totp" : "/staf");
  return actor;
}
