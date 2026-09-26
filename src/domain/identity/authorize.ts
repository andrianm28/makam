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
  /** The Akun's Email Terverifikasi, its key (ADR 0004). */
  email: string;
  /** The Akun's phone number: a contact only, never verified (null until one is given). */
  phoneNumber: string | null;
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
  /** Change one's own Akun's email (Verifikasi Email). */
  | "akun.email"
  /** Change one's own Akun's phone number (a contact). */
  | "akun.telepon"
  /** Pemulihan Akun: move an Akun to a new Email Terverifikasi after a KTP check (Admin Platform). */
  | "akun.pemulihan"
  /** Turn push on or off for a Perangkat Push of one's own Akun Staf. */
  | "akun.push"
  /** Read one's own Peringatan Staf (the bell) and mark them read. */
  | "akun.peringatan"
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
  | "lokasi.atur_admin_lokasi"
  /** Enter tariffs: a Lokasi Mitra's (Jenis Makam, Biaya Pemakaman, the "tarif diperiksa" mark) or the global ones (Admin Platform only). */
  | "tarif.ubah"
  /** Set a Lokasi Mitra's Jam Operasional and pick its Kontak Siaga (Admin Platform, or that Lokasi's Admin Lokasi). */
  | "lokasi.atur_operasional"
  /** Keep the Hari Libur Nasional list of the Admin Platform Hari Kerja calendar (Admin Platform only). */
  | "hari_libur.ubah"
  /** See a Lokasi Mitra's Denah (Admin Platform, or that Lokasi's Admin Lokasi). */
  | "denah.lihat"
  /** Build or edit a Lokasi Mitra's Denah: Blok, Petak, Kavling Keluarga, site-plan photo (that Lokasi's Admin Lokasi only). */
  | "denah.ubah"
  /** Renumber a Petak Makam, the old Nomor Makam kept as a hidden alias (Admin Platform only). */
  | "petak.nomor_ulang"
  /** Admin Platform creates and assigns a Tugas Lapangan to one Petugas Lapangan. */
  | "tugas_lapangan.buat"
  /** Admin Platform lists every Tugas Lapangan. */
  | "tugas_lapangan.lihat_semua"
  /** A Petugas Lapangan's own "Tugas saya" list. */
  | "tugas_lapangan.punya_saya"
  /** See one Tugas Lapangan: Admin Platform, or its assigned Petugas Lapangan (checked against the row by the fieldwork module). */
  | "tugas_lapangan.lihat"
  /** Mark a Tugas Lapangan Selesai: its assigned Petugas Lapangan only (checked against the row by the fieldwork module). */
  | "tugas_lapangan.selesaikan"
  /** A completed Kunjungan Verifikasi updates the Lokasi's pin, facilities, photos and "dikunjungi" date (the fieldwork module, the visiting Petugas Lapangan). */
  | "lokasi.catat_kunjungan_verifikasi"
  /** A completed Cek Denah is recorded on the Lokasi (the fieldwork module, the checking Petugas Lapangan). */
  | "lokasi.catat_cek_denah";

/** What the action is done to. */
export type Resource =
  | { kind: "akun"; accountId: string }
  | { kind: "staf" }
  | { kind: "menu_staf"; role: StaffRole }
  | { kind: "audit_log" }
  | { kind: "pengaturan_operator" }
  | { kind: "audit_log_lokasi"; lokasiId: string }
  | { kind: "lokasi_mitra_semua" }
  | { kind: "lokasi_mitra"; lokasiId: string }
  | { kind: "tarif_global" }
  | { kind: "hari_libur_nasional" }
  | { kind: "tugas_lapangan_semua" }
  | { kind: "tugas_lapangan"; id: string };

/** The Akun with this id, as the resource of an action. */
export function akunResource(accountId: string): Resource {
  return { kind: "akun", accountId };
}

/** The staff roster (invites, Akun Staf, Pemulihan Akun). */
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

/** The global tariffs: Biaya Layanan Platform, DKI Biaya Pengurusan, Retribusi Pemda. */
export function tarifGlobalResource(): Resource {
  return { kind: "tarif_global" };
}

/** The Hari Libur Nasional list (the Admin Platform Hari Kerja calendar). */
export function hariLiburNasionalResource(): Resource {
  return { kind: "hari_libur_nasional" };
}

/** Every Tugas Lapangan (creating one, the Admin Platform list, a Petugas Lapangan's "Tugas saya"). */
export function semuaTugasLapanganResource(): Resource {
  return { kind: "tugas_lapangan_semua" };
}

/** One Tugas Lapangan. */
export function tugasLapanganResource(id: string): Resource {
  return { kind: "tugas_lapangan", id };
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
    case "akun.telepon":
      return resource.kind === "akun" && resource.accountId === actor.accountId ? allowed : denied;
    case "akun.push":
    case "akun.peringatan":
      return resource.kind === "akun" && resource.accountId === actor.accountId && staffRoles.some(holds)
        ? allowed
        : denied;
    case "staf.menu":
      return resource.kind === "menu_staf" && holds(resource.role) ? allowed : denied;
    case "staf.undang":
    case "staf.nonaktifkan":
    case "akun.pemulihan":
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
    case "lokasi.atur_operasional":
      // Admin Platform sees (and sets the Jam Operasional of) every Lokasi Mitra; an Admin Lokasi only its own.
      return resource.kind === "lokasi_mitra" && (holds("admin_platform") || adminLokasiOf(actor, resource.lokasiId))
        ? allowed
        : denied;
    case "lokasi.ubah":
    case "lokasi.lihat_perjanjian":
    case "lokasi.lihat_rekening":
    case "lokasi.ubah_rekening":
    case "lokasi.atur_admin_lokasi":
      return resource.kind === "lokasi_mitra" && holds("admin_platform") ? allowed : denied;
    case "tarif.ubah":
      // Only Admin Platform enters tariffs (spec, Identity & Access); an Admin Lokasi only reads them.
      return (resource.kind === "lokasi_mitra" || resource.kind === "tarif_global") && holds("admin_platform")
        ? allowed
        : denied;
    case "hari_libur.ubah":
      return resource.kind === "hari_libur_nasional" && holds("admin_platform") ? allowed : denied;
    case "denah.lihat":
      // Admin Platform sees every Lokasi Mitra's Denah; an Admin Lokasi only its own.
      return resource.kind === "lokasi_mitra" && (holds("admin_platform") || adminLokasiOf(actor, resource.lokasiId))
        ? allowed
        : denied;
    case "denah.ubah":
      // The Denah is built by that Lokasi's own Admin Lokasi (spec, story 127); Admin Platform does not edit it here.
      return resource.kind === "lokasi_mitra" && adminLokasiOf(actor, resource.lokasiId) ? allowed : denied;
    case "petak.nomor_ulang":
      // Only Admin Platform renumbers a Petak (spec, story 169): the Denah's own Admin Lokasi does not.
      return resource.kind === "lokasi_mitra" && holds("admin_platform") ? allowed : denied
    case "tugas_lapangan.buat":
    case "tugas_lapangan.lihat_semua":
      return resource.kind === "tugas_lapangan_semua" && holds("admin_platform") ? allowed : denied;
    case "tugas_lapangan.punya_saya":
      return resource.kind === "tugas_lapangan_semua" && holds("petugas_lapangan") ? allowed : denied;
    case "tugas_lapangan.lihat":
      // Which case this actor may act on is checked against the row by the fieldwork module (a Petugas Lapangan carries no per-task list, unlike an Admin Lokasi's `lokasiIds`).
      return resource.kind === "tugas_lapangan" && (holds("admin_platform") || holds("petugas_lapangan")) ? allowed : denied;
    case "tugas_lapangan.selesaikan":
      // Only its assigned Petugas Lapangan marks a Tugas Lapangan Selesai (spec, story 174); Admin Platform only views it.
      return resource.kind === "tugas_lapangan" && holds("petugas_lapangan") ? allowed : denied;
    case "lokasi.catat_kunjungan_verifikasi":
    case "lokasi.catat_cek_denah":
      return resource.kind === "lokasi_mitra" && holds("petugas_lapangan") ? allowed : denied;
  }
}
