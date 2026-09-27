import type { AuditAction, AuditActorRole } from "@/domain/audit";
import type { LokasiMitraStatus } from "@/domain/lokasi";
import { staffRoleLabels } from "./staff-role-labels";

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
  "akun.pemulihan": "Pemulihan Akun",
  "akun.ubah_telepon": "Ubah nomor telepon",
  "akun.totp_daftar": "Authenticator didaftarkan",
  "akun.totp_reset": "Authenticator direset",
  "katalog_lama.impor": "Katalog aplikasi lama diimpor",
  "pengaturan_operator.ubah": "Pengaturan Operator diubah",
  "akun.push_aktifkan": "Perangkat Push diaktifkan",
  "akun.push_matikan": "Perangkat Push dimatikan",
  "akun.email_verifikasi": "Verifikasi Email",
  "lokasi.buat": "Lokasi Mitra dibuat",
  "lokasi.ubah_profil": "Profil diubah",
  "lokasi.tandai_data_contoh": "Ditandai data contoh",
  "lokasi.ubah_dokumen": "Daftar dokumen diubah",
  "lokasi.ubah_kebijakan": "Kebijakan diubah",
  "lokasi.ubah_rekening": "Rekening diubah",
  "lokasi.unggah_perjanjian": "Scan perjanjian diunggah",
  "tarif.ubah_global": "Tarif global diubah",
  "tarif.buat_jenis_makam": "Jenis Makam ditambahkan",
  "tarif.ubah_jenis_makam": "Tarif Jenis Makam diubah",
  "tarif.ubah_biaya_pemakaman": "Biaya Pemakaman diubah",
  "tarif.tandai_diperiksa": "Tarif ditandai sudah diperiksa",
  "lokasi.ubah_jam_operasional": "Jam Operasional diubah",
  "lokasi.pilih_kontak_siaga": "Kontak Siaga dipilih",
  "hari_libur.tambah": "Hari Libur Nasional ditambahkan",
  "hari_libur.hapus": "Hari Libur Nasional dihapus",
  "catatan_internal.tulis": "Catatan Internal",
  "antrean.ambil": "Baris Antrean diambil",
  "telepon_pemesan.catat_panggilan": "Panggilan Pemesan dicatat",
  "denah.buat_blok": "Blok dibuat",
  "denah.ubah_jenis_sel": "Jenis sel diubah",
  "denah.atur_jenis_makam": "Jenis Makam diatur",
  "denah.ubah_nomor": "Nomor Makam diubah",
  "denah.buat_kavling": "Kavling Keluarga dibuat",
  "denah.pisahkan_kavling": "Kavling Keluarga dipisahkan",
  "denah.ubah_baris_kolom": "Baris/kolom Blok diubah",
  "denah.unggah_foto_blok": "Foto denah Blok diunggah",
  "denah.bersihkan_petak": "Petak dibersihkan",
  "petak.nomor_ulang": "Nomor Petak diubah (renumbering)",
  "tugas_lapangan.buat": "Tugas Lapangan dibuat",
  "tugas_lapangan.selesai": "Tugas Lapangan ditandai Selesai",
  "lokasi.catat_kunjungan_verifikasi": "Kunjungan Verifikasi dicatat",
  "lokasi.catat_cek_denah": "Cek Denah dicatat",
  "lokasi.terbitkan": "Lokasi Mitra diterbitkan (Terverifikasi)",
  "lokasi.aktifkan_terencana": "Pemesanan Terencana diaktifkan",
  "lokasi.konfirmasi_syarat_tayang": "Syarat tayang dikonfirmasi masih terpenuhi",
};

/** The role an Entri Audit's actor wrote under. */
export function auditActorLabel(role: AuditActorRole): string {
  if (role === "seed_cli" || role === "ops_cli") return "Operator (server)";
  if (role === "pemesan") return "Pemilik Akun";
  return staffRoleLabels[role];
}
