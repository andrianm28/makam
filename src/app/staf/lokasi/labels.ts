import type { AuditAction, AuditActorRole } from "@/domain/audit";
import type { LokasiMitraStatus } from "@/domain/lokasi";
import { staffRoleLabels } from "../role-labels";

/** How each Lokasi Mitra status is named on screen (CONTEXT.md). */
export const lokasiStatusLabels: Record<LokasiMitraStatus, string> = {
  belum_tayang: "Belum Tayang",
  terverifikasi: "Terverifikasi",
  ditangguhkan: "Ditangguhkan",
  berhenti: "Berhenti",
};

/** What an Entri Audit's action is called in a Lokasi's Audit Log. */
export const auditActionLabels: Record<AuditAction, string> = {
  "staf.seed_admin_platform": "Admin Platform pertama dibuat",
  "staf.undang": "Undangan Staf dikirim",
  "staf.peran_diberikan": "Peran staf diterima",
  "staf.nonaktifkan": "Akun Staf dinonaktifkan",
  "staf.lepas_admin_lokasi": "Admin Lokasi dilepas",
  "akun.pindah_nomor": "Pindah Nomor",
  "akun.totp_daftar": "Authenticator didaftarkan",
  "akun.totp_reset": "Authenticator direset",
  "lokasi.buat": "Lokasi Mitra dibuat",
  "lokasi.ubah_profil": "Profil diubah",
  "lokasi.ubah_dokumen": "Daftar dokumen diubah",
  "lokasi.ubah_kebijakan": "Kebijakan diubah",
  "lokasi.ubah_rekening": "Rekening diubah",
  "lokasi.unggah_perjanjian": "Scan perjanjian diunggah",
  "catatan_internal.tulis": "Catatan Internal",
  "antrean.ambil": "Baris Antrean diambil",
};

/** The role an Entri Audit's actor wrote under. */
export function auditActorLabel(role: AuditActorRole): string {
  if (role === "seed_cli" || role === "ops_cli") return "Operator (server)";
  if (role === "pemesan") return "Pemilik Akun";
  return staffRoleLabels[role];
}
