/**
 * The one authorisation check every Server Action calls (spec, Identity &
 * Access > Roles). Pemesan is the implicit role of every account; the staff
 * roles (Admin Platform, Admin Lokasi, Petugas Lapangan, Mitra Jasa) come by
 * Undangan Staf. One Akun may hold several.
 */

export const staffRoles = ["admin_platform", "admin_lokasi", "petugas_lapangan", "mitra_jasa"] as const;
export type StaffRole = (typeof staffRoles)[number];
export type Role = "pemesan" | StaffRole;

/**
 * Where the signed-in session stands on TOTP. Only an Akun holding Admin
 * Platform needs it, and then for the whole Akun (spec: the strictest rule).
 */
export type TotpStatus =
  /** The Akun holds no Admin Platform role. */
  | "tidak_perlu"
  /** Admin Platform has not enrolled an authenticator yet. */
  | "perlu_daftar"
  /** Enrolled, but this session has not passed TOTP yet. */
  | "perlu_verifikasi"
  /** This session passed TOTP. */
  | "lolos";

/** Who is acting: the signed-in account behind a request. */
export interface Actor {
  accountId: string;
  /** Canonical E.164 WhatsApp number. */
  phoneNumber: string;
  roles: Role[];
  totp: TotpStatus;
}

/** What an actor wants to do. Later tickets add their actions to this list. */
export type Action =
  /** Open Akun Saya. */
  | "akun.lihat"
  /** Sign out (Keluar). */
  | "akun.keluar"
  /** Enrol or pass TOTP on one's own Akun. */
  | "akun.totp"
  /** Pindah Nomor: move an Akun to a new WhatsApp number (Admin Platform). */
  | "akun.pindah_nomor"
  /** Open one role's menu in the staff area. */
  | "staf.menu"
  /** Send an Undangan Staf (Admin Platform). */
  | "staf.undang"
  /** Deactivate an Akun Staf (Admin Platform). */
  | "staf.nonaktifkan"
  /** Read the whole Audit Log. */
  | "audit.lihat";

/** What the action is done to. */
export type Resource =
  | { kind: "akun"; accountId: string }
  | { kind: "staf" }
  | { kind: "menu_staf"; role: StaffRole }
  | { kind: "audit_log" };

/** The Akun with this id, as the resource of an action. */
export function akunResource(accountId: string): Resource {
  return { kind: "akun", accountId };
}

/** The staff roster (invites, Akun Staf, Pindah Nomor). */
export function stafResource(): Resource {
  return { kind: "staf" };
}

/** One role's menu in the staff area. */
export function stafMenuResource(role: StaffRole): Resource {
  return { kind: "menu_staf", role };
}

/** The whole Audit Log. The Lokasi-scoped view for Admin Lokasi is ticket 10. */
export function auditLogResource(): Resource {
  return { kind: "audit_log" };
}

export type Authorization =
  | { allowed: true }
  | { allowed: false; reason: "belum_masuk" | "tidak_berwenang" | "perlu_totp" };

const allowed: Authorization = { allowed: true };
const denied: Authorization = { allowed: false, reason: "tidak_berwenang" };

/** Actions an Akun holding Admin Platform may take before passing TOTP. */
const beforeTotp: ReadonlySet<Action> = new Set<Action>(["akun.totp", "akun.keluar"]);

export function authorize(actor: Actor | null, action: Action, resource: Resource): Authorization {
  if (!actor) return { allowed: false, reason: "belum_masuk" };
  if ((actor.totp === "perlu_daftar" || actor.totp === "perlu_verifikasi") && !beforeTotp.has(action)) {
    return { allowed: false, reason: "perlu_totp" };
  }
  const holds = (role: Role) => actor.roles.includes(role);

  switch (action) {
    case "akun.lihat":
    case "akun.keluar":
    case "akun.totp":
      return resource.kind === "akun" && resource.accountId === actor.accountId ? allowed : denied;
    case "staf.menu":
      return resource.kind === "menu_staf" && holds(resource.role) ? allowed : denied;
    case "staf.undang":
    case "staf.nonaktifkan":
    case "akun.pindah_nomor":
    case "audit.lihat":
      return holds("admin_platform") ? allowed : denied;
  }
}
