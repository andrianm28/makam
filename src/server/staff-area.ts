import "server-only";
import { redirect } from "next/navigation";
import { authorize, needsTotp, stafMenuResource, staffRoles, type Actor, type Role, type StaffRole } from "@/domain/identity";
import type { LokasiMitraSummary } from "@/domain/lokasi";
import { rilisAktif, type Rilis } from "@/lib/rilis";
import { staffRoleLabels } from "@/lib/staff-role-labels";
import { staffRoleHome } from "@/lib/staff-area-path";
import { staffPalette, type PaletteGroup } from "@/lib/staff-navigation";
import type { StaffAlertEntry } from "@/domain/notifications";
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
  account: { email: string; phoneNumber: string | null };
  /** The Lokasi Mitra this Akun works on, by id, so breadcrumbs can name them. */
  lokasiNames: Record<string, string>;
  /** Every Blok of this Akun's own Lokasi Mitra (Admin Lokasi only), by id, so a Denah editor's breadcrumb can name it. */
  blokNames: Record<string, string>;
  /** The signed-in Akun's own Lokasi Mitra, for the header's Lokasi switcher; empty unless it holds Admin Lokasi. */
  adminLokasi: LokasiMitraSummary[];
  /**
   * The command palette's pages, for each staff role the Akun holds and only
   * those: what that role may open (an Admin Lokasi only its own Lokasi Mitra).
   */
  palette: Partial<Record<StaffRole, PaletteGroup[]>>;
  /** The release this environment has opened (ADR 0006): the sidebar hides the items of a closed feature. */
  rilis: Rilis;
  /** The Peringatan Staf bell: how many are unread, and the latest. */
  alerts: { unread: number; latest: StaffAlertEntry[] };
  /**
   * How many Tier 1 Antrean rows nobody has taken (Ambil): the red banner in the header of every
   * staff page of an Admin Platform (ADR 0004; ticket 28). Always 0 for an Akun that is not one.
   */
  tier1BelumDiambil: number;
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

  const { lokasi, inventory, notifications, queues } = serverRuntime();
  const [lokasiMitra, alerts, tier1BelumDiambil] = await Promise.all([
    held.includes("admin_platform")
      ? lokasi.allLokasiMitra(actor)
      : held.includes("admin_lokasi")
        ? lokasi.lokasiMitraOfAdminLokasi(actor)
        : Promise.resolve([]),
    notifications.staffAlerts(actor),
    held.includes("admin_platform") ? queues.tier1BelumDiambil(actor) : Promise.resolve(0),
  ]);
  // Each role sees only the Lokasi Mitra it may open: all for Admin Platform, its own for Admin Lokasi.
  const lokasiOf = (role: StaffRole) =>
    role === "admin_platform"
      ? lokasiMitra
      : role === "admin_lokasi"
        ? lokasiMitra.filter((item) => actor.lokasiIds.includes(item.id))
        : [];
  const ownLokasi = lokasiOf("admin_lokasi");
  // Only an Admin Lokasi's own (few) Lokasi Mitra, so this stays as small as lokasiNames above; Admin Platform's Denah has no per-Blok route to name.
  const bloksByLokasi = held.includes("admin_lokasi")
    ? await Promise.all(ownLokasi.map((item) => inventory.asStaff(actor).bloks(item.id)))
    : [];
  return {
    roles: held.map((role) => ({ role, label: staffRoleLabels[role], href: staffRoleHome(role) })),
    account: { email: actor.email, phoneNumber: actor.phoneNumber },
    lokasiNames: Object.fromEntries(lokasiMitra.map((item) => [item.id, item.name])),
    blokNames: Object.fromEntries(bloksByLokasi.flat().map((blok) => [blok.id, blok.name])),
    adminLokasi: ownLokasi,
    palette: Object.fromEntries(held.map((role) => [role, staffPalette(role, lokasiOf(role), rilisAktif())])),
    rilis: rilisAktif(),
    alerts: alerts.ok ? { unread: alerts.unread, latest: alerts.latest } : { unread: 0, latest: [] },
    tier1BelumDiambil,
  };
}
