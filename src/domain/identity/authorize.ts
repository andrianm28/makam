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
  /** The session this actor signed in with (TOTP is passed per session). */
  sessionId: string;
}

/** What an actor wants to do. Later tickets add their actions to this list. */
export type Action =
  /** Open Akun Saya. */
  | "akun.lihat"
  /** Sign out (Keluar). */
  | "akun.keluar"
  /** Enrol or pass TOTP on one's own Akun. */
  | "akun.totp"
  /** Change, remove or verify (Verifikasi Email) one's own Akun's email. */
  | "akun.email"
  /** Pindah Nomor: move an Akun to a new WhatsApp number (Admin Platform). */
  | "akun.pindah_nomor"
  /** Turn push on or off for a Perangkat Push of one's own Akun Staf. */
  | "akun.push"
  /** Open one role's menu in the staff area. */
  | "staf.menu"
  /** Send an Undangan Staf (Admin Platform). */
  | "staf.undang"
  /** Deactivate an Akun Staf (Admin Platform). */
  | "staf.nonaktifkan"
  /** Read the whole Audit Log. */
  | "audit.lihat"
  /** Open the Pengaturan Operator edit screen (Admin Platform). */
  | "pengaturan_operator.lihat"
  /** Change Pengaturan Operator (Admin Platform). */
  | "pengaturan_operator.ubah";

/** What the action is done to. */
export type Resource =
  | { kind: "akun"; accountId: string }
  | { kind: "staf" }
  | { kind: "menu_staf"; role: StaffRole }
  | { kind: "audit_log" }
  | { kind: "pengaturan_operator" };

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

/** Pengaturan Operator: the Operator's own reference values. */
export function pengaturanOperatorResource(): Resource {
  return { kind: "pengaturan_operator" };
}

export type Authorization =
  | { allowed: true }
  | { allowed: false; reason: "belum_masuk" | "tidak_berwenang" | "perlu_totp" };

const allowed: Authorization = { allowed: true };
const denied: Authorization = { allowed: false, reason: "tidak_berwenang" };

/** True while the actor's session must still enrol or pass TOTP before anything else (Admin Platform only). */
export function needsTotp(actor: Pick<Actor, "totp">): boolean {
  return actor.totp === "perlu_daftar" || actor.totp === "perlu_verifikasi";
}

/** Actions an Akun holding Admin Platform may take before passing TOTP. */
const beforeTotp: ReadonlySet<Action> = new Set<Action>(["akun.totp", "akun.keluar"]);

/** Why a domain module refuses a write the actor may not do. */
export type WriteRefusal = { ok: false; reason: "tidak_berwenang" | "perlu_totp" };

/**
 * A domain module's own check before a write (defence in depth behind
 * `guarded()`): null when `actor` may do `action` on `resource`, else the
 * refusal to return. A caller that is not signed in is `tidak_berwenang`.
 */
export function writeRefusal(actor: Actor, action: Action, resource: Resource): WriteRefusal | null {
  const authorization = authorize(actor, action, resource);
  if (authorization.allowed) return null;
  return { ok: false, reason: authorization.reason === "perlu_totp" ? "perlu_totp" : "tidak_berwenang" };
}

export function authorize(actor: Actor | null, action: Action, resource: Resource): Authorization {
  if (!actor) return { allowed: false, reason: "belum_masuk" };
  if (needsTotp(actor) && !beforeTotp.has(action)) {
    return { allowed: false, reason: "perlu_totp" };
  }
  const holds = (role: Role) => actor.roles.includes(role);

  switch (action) {
    case "akun.lihat":
    case "akun.keluar":
    case "akun.totp":
    case "akun.email":
      return resource.kind === "akun" && resource.accountId === actor.accountId ? allowed : denied;
    case "akun.push":
      return resource.kind === "akun" && resource.accountId === actor.accountId && staffRoles.some(holds)
        ? allowed
        : denied;
    case "staf.menu":
      return resource.kind === "menu_staf" && holds(resource.role) ? allowed : denied;
    case "staf.undang":
    case "staf.nonaktifkan":
    case "akun.pindah_nomor":
    case "audit.lihat":
      return holds("admin_platform") ? allowed : denied;
    case "pengaturan_operator.lihat":
      // The edit screen: Admin Platform only (the values themselves are public, read by server code).
      return resource.kind === "pengaturan_operator" && holds("admin_platform") ? allowed : denied;
    case "pengaturan_operator.ubah":
      return resource.kind === "pengaturan_operator" && holds("admin_platform") ? allowed : denied;
  }
}
