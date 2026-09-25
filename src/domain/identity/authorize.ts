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
  /** The Lokasi Mitra this Akun is Admin Lokasi of (empty without that role). Scopes every Admin Lokasi screen. */
  lokasiIds: string[];
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
  | "pengaturan_operator.ubah"
  /** Create a Lokasi Mitra (Admin Platform). */
  | "lokasi.buat"
  /** List every Lokasi Mitra (Admin Platform). */
  | "lokasi.lihat_semua"
  /** See one Lokasi Mitra's record. */
  | "lokasi.lihat"
  /** Change a Lokasi Mitra's onboarding record: profile, pin, facilities, documents, policies, flags, agreement (Admin Platform). */
  | "lokasi.ubah"
  /** See a Lokasi Mitra's bank account (Admin Platform only). */
  | "lokasi.lihat_rekening"
  /** Open a Lokasi Mitra's agreement scan by its signed link (Admin Platform only). */
  | "lokasi.lihat_perjanjian"
  /** Set or change a Lokasi Mitra's bank account (Admin Platform only). */
  | "lokasi.ubah_rekening"
  /** Change which Admin Lokasi a Lokasi Mitra has: invite or remove one (Admin Platform only). */
  | "lokasi.atur_admin_lokasi";

/** What the action is done to. */
export type Resource =
  | { kind: "akun"; accountId: string }
  | { kind: "staf" }
  | { kind: "menu_staf"; role: StaffRole }
  | { kind: "audit_log" }
  | { kind: "pengaturan_operator" }
  | { kind: "audit_log_lokasi"; lokasiId: string }
  | { kind: "lokasi_mitra_semua" }
  | { kind: "lokasi_mitra"; lokasiId: string };

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

/** The whole Audit Log (Admin Platform only). */
export function auditLogResource(): Resource {
  return { kind: "audit_log" };
}

/** Pengaturan Operator: the Operator's own reference values. */
export function pengaturanOperatorResource(): Resource {
  return { kind: "pengaturan_operator" };
}

/**
 * One Lokasi Mitra's Audit Log, as its Admin Lokasi see it (without Catatan
 * Internal and Antrean claims): Admin Platform and that Lokasi's Admin Lokasi.
 */
export function auditLogLokasiResource(lokasiId: string): Resource {
  return { kind: "audit_log_lokasi", lokasiId };
}

/** Every Lokasi Mitra (onboarding a new one, the Admin Platform list). */
export function semuaLokasiMitraResource(): Resource {
  return { kind: "lokasi_mitra_semua" };
}

/** One Lokasi Mitra's record. */
export function lokasiMitraResource(lokasiId: string): Resource {
  return { kind: "lokasi_mitra", lokasiId };
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

/** True when the actor holds Admin Lokasi and is Admin Lokasi of this Lokasi Mitra. */
function adminLokasiOf(actor: Actor, lokasiId: string): boolean {
  return actor.roles.includes("admin_lokasi") && actor.lokasiIds.includes(lokasiId);
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
    case "lokasi.buat":
      return holds("admin_platform") ? allowed : denied;
    case "pengaturan_operator.lihat":
      // The edit screen: Admin Platform only (the values themselves are public, read by server code).
      return resource.kind === "pengaturan_operator" && holds("admin_platform") ? allowed : denied;
    case "pengaturan_operator.ubah":
      return resource.kind === "pengaturan_operator" && holds("admin_platform") ? allowed : denied;
    case "audit.lihat":
      if (holds("admin_platform")) return allowed;
      // Mitra Jasa and Petugas Lapangan never see the Audit Log; an Admin Lokasi sees only its own Lokasi's view.
      return resource.kind === "audit_log_lokasi" && adminLokasiOf(actor, resource.lokasiId) ? allowed : denied;
    case "lokasi.lihat_semua":
      return resource.kind === "lokasi_mitra_semua" && holds("admin_platform") ? allowed : denied;
    case "lokasi.lihat":
      // Admin Platform sees every Lokasi Mitra; an Admin Lokasi only the Lokasi it is Admin Lokasi of.
      return resource.kind === "lokasi_mitra" && (holds("admin_platform") || adminLokasiOf(actor, resource.lokasiId))
        ? allowed
        : denied;
    case "lokasi.ubah":
    case "lokasi.lihat_perjanjian":
    case "lokasi.lihat_rekening":
    case "lokasi.ubah_rekening":
    case "lokasi.atur_admin_lokasi":
      return resource.kind === "lokasi_mitra" && holds("admin_platform") ? allowed : denied;
  }
}
