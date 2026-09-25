/**
 * The one authorisation check every Server Action calls (spec, Identity &
 * Access > Roles). Pemesan is the implicit role of every account; ticket 09
 * adds the staff roles (Admin Lokasi, Admin Platform, Petugas Lapangan, Mitra
 * Jasa) and their actions here.
 */

/** Every account is a Pemesan; staff roles arrive with ticket 09. */
export type Role = "pemesan";

/** Who is acting: the signed-in account behind a request. */
export interface Actor {
  accountId: string;
  /** Canonical E.164 WhatsApp number. */
  phoneNumber: string;
  roles: Role[];
}

/** What an actor wants to do. Later tickets add their actions to this list. */
export type Action =
  /** Open Akun Saya. */
  | "akun.lihat"
  /** Sign out (Keluar). */
  | "akun.keluar";

/** What the action is done to. */
export type Resource = { kind: "akun"; accountId: string };

/** The Akun with this id, as the resource of an action. */
export function akunResource(accountId: string): Resource {
  return { kind: "akun", accountId };
}

export type Authorization =
  | { allowed: true }
  | { allowed: false; reason: "belum_masuk" | "tidak_berwenang" };

export function authorize(actor: Actor | null, action: Action, resource: Resource): Authorization {
  if (!actor) return { allowed: false, reason: "belum_masuk" };

  switch (action) {
    case "akun.lihat":
    case "akun.keluar":
      return actor.roles.includes("pemesan") && resource.accountId === actor.accountId
        ? { allowed: true }
        : { allowed: false, reason: "tidak_berwenang" };
  }
}
