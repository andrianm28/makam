import "server-only";
import { redirect } from "next/navigation";
import { authorize, needsTotp, stafMenuResource, staffRoles, type Actor, type Role, type StaffRole } from "@/domain/identity";
import { staffRoleLabels } from "@/lib/staff-role-labels";
import { staffRoleHome } from "@/lib/staff-area-path";
import { serverRuntime } from "./runtime";
import { currentActor } from "./session";

/** The staff roles an actor holds, in the fixed order. */
export function heldStaffRoles(roles: Role[]): StaffRole[] {
  return staffRoles.filter((role) => roles.includes(role));
}

/** Where a signed-in actor lands: the TOTP step, the first staff menu, or Akun Saya. */
export function homeFor(actor: Actor): string {
  if (needsTotp(actor)) return "/staf/totp";
  const [first] = heldStaffRoles(actor.roles);
  return first ? staffRoleHome(first) : "/akun";
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

export interface StaffShell {
  /** The staff roles the Akun holds, for the role switcher (hidden when there is one). */
  roles: { role: StaffRole; label: string; href: string }[];
  /** Who is signed in, for the account menu. */
  account: { phoneNumber: string; email: string | null };
  /** The Lokasi Mitra this Akun works on, by id, so breadcrumbs can name them. */
  lokasiNames: Record<string, string>;
}

/**
 * What the staff shell shows the signed-in Akun, or null when it gets no shell:
 * signed out, a Pemesan, or an Admin Platform who has not passed the TOTP step
 * (those pages render bare; each page still checks access itself).
 */
export async function staffShell(): Promise<StaffShell | null> {
  const actor = await currentActor();
  if (!actor || needsTotp(actor)) return null;
  const held = heldStaffRoles(actor.roles);
  if (held.length === 0) return null;

  const { identity, lokasi } = serverRuntime();
  const [{ email }, lokasiMitra] = await Promise.all([
    identity.accountEmail(actor),
    held.includes("admin_platform")
      ? lokasi.allLokasiMitra(actor)
      : held.includes("admin_lokasi")
        ? lokasi.lokasiMitraOfAdminLokasi(actor)
        : Promise.resolve([]),
  ]);
  return {
    roles: held.map((role) => ({ role, label: staffRoleLabels[role], href: staffRoleHome(role) })),
    account: { phoneNumber: actor.phoneNumber, email },
    lokasiNames: Object.fromEntries(lokasiMitra.map((item) => [item.id, item.name])),
  };
}
