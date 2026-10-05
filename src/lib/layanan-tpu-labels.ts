import type { AlasanTolakPesananTpu, JawabPenugasanResult, LepasPenugasanResult, PekerjaanTpuStatus, PenugasanHasil, TugaskanMitraJasaResult } from "@/domain/layanan";
import type { PengembalianPesanan } from "@/domain/refunds";

/**
 * How Layanan at a DKI TPU reaches a screen (ticket 56): every refusal of the TPU
 * order, of Admin Platform's assignment and of a Mitra Jasa's answer, in Bahasa
 * Indonesia and saying what to do next, plus the words for a job's status and for how
 * an assignment ended. The module carries the facts; the wording lives here, once.
 */

/** Why the TPU order cannot be placed, saying what to do next. */
export const layananTpuOrderMessages: Record<AlasanTolakPesananTpu | "belum_masuk" | "perlu_totp" | "tidak_berwenang", string> = {
  input_tidak_valid: "Periksa lagi isian Anda.",
  tpu_tidak_ada: "TPU ini tidak ada di daftar kami. Pilih TPU dari daftar.",
  layanan_tidak_tersedia: "Layanan ini tidak tersedia di TPU. Pilih dari daftar yang tersedia.",
  baris_tidak_bisa_ditagih: "Harga layanan ini belum bisa ditagihkan. Coba lagi sebentar, atau hubungi CS.",
  lead_time_melewati: "Tanggal yang dipilih masih di dalam masa tunggu layanan. Pilih tanggal yang lebih jauh.",
  teks_kosong: "Layanan ini minta isian tambahan. Isi dulu kolomnya.",
  harga_tidak_tersedia: "Harga layanan ini belum tersedia atau sudah berubah. Muat ulang halaman ini.",
  tagihan_tidak_terbit: "Tagihan belum bisa diterbitkan, jadi pesanan tidak jadi dibuat. Coba lagi sebentar, atau hubungi CS.",
  email_bukan_akun_ini: "Email ini bukan email akun Anda. Kirim ulang dengan email lain.",
  foto_tidak_didukung: "Foto makam harus berupa foto (JPG, PNG atau WebP). Coba unggah ulang.",
  foto_terlalu_besar: "Foto makam terlalu besar. Ambil ulang foto yang lebih kecil.",
  berkas_gagal_disimpan: "Foto makam gagal disimpan. Coba lagi sebentar, atau kirim tanpa foto.",
  nomor_tidak_valid: "Nomor telepon belum lengkap. Tulis ulang dengan nomor yang bisa dihubungi.",
  nomor_bukan_indonesia: "Nomor telepon harus berawalan 08 atau berformat luar negeri.",
  belum_masuk: "Masuk dulu untuk memesan layanan.",
  perlu_totp: "Masukkan kode dari aplikasi authenticator Anda dulu.",
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
};

type Ditolak<R> = R extends { ok: false; reason: infer Alasan } ? Alasan : never;

/** Why Admin Platform's assignment, release or a Mitra Jasa's answer was refused. */
export const penugasanMessages: Record<
  Ditolak<TugaskanMitraJasaResult> | Ditolak<LepasPenugasanResult> | Ditolak<JawabPenugasanResult>,
  string
> = {
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
  perlu_totp: "Masukkan kode dari aplikasi authenticator Anda dulu.",
  belum_masuk: "Masuk dulu untuk melanjutkan.",
  input_tidak_valid: "Periksa lagi isian Anda.",
  tidak_ditemukan: "Pekerjaan ini tidak ditemukan, atau bukan lagi milik Anda.",
  bukan_dijadwalkan: "Pekerjaan ini sudah tidak berstatus Dijadwalkan, jadi tidak bisa ditugaskan.",
  sudah_ditugaskan: "Pekerjaan ini sudah dipegang Mitra Jasa lain. Lepaskan dulu bila mau menugaskan ulang.",
  mitra_jasa_tidak_tersedia:
    "Mitra Jasa ini tidak memenuhi syarat untuk pekerjaan ini: harus Aktif, mencakup TPU dan layanannya, dan tidak Tidak tersedia pada tanggalnya.",
  tidak_ada_penugasan: "Pekerjaan ini tidak sedang dipegang siapa pun.",
  sudah_dijawab: "Pekerjaan ini sudah Anda jawab.",
  lewat_batas: "Batas waktu menjawab sudah lewat, jadi pekerjaan ini kembali ke Admin Platform.",
};

/** A TPU job's status, in the words its Pemesan and staff read. */
export const pekerjaanTpuStatusLabels: Record<PekerjaanTpuStatus, string> = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  dijadwalkan: "Dijadwalkan",
  sedang_dikerjakan: "Sedang Dikerjakan",
  menunggu_verifikasi: "Menunggu Verifikasi",
  selesai: "Selesai",
  terlambat: "Terlambat",
  dibatalkan: "Dibatalkan",
  keluhan: "Keluhan",
};

/** How an assignment stands or ended, for Admin Platform's history and a Mitra Jasa's own. */
export const penugasanHasilLabels: Record<PenugasanHasil, string> = {
  menunggu: "Menunggu jawaban",
  diterima: "Diterima",
  ditolak: "Ditolak",
  tidak_direspons: "Tidak direspons",
  dilepas: "Dilepas untuk ditugaskan ulang",
};

/** Why a job is back in the queue with no one holding it. */
export const alasanAntreLabels = {
  belum_ditugaskan: "Belum ditugaskan",
  ditolak: "Ditolak Mitra Jasa",
  tidak_direspons: "Tidak direspons sampai batas waktu",
  dilepas: "Perlu penugasan ulang",
} as const;

/** Why the Pemesan's Keluhan on a TPU job is refused, saying what to do next (ticket 57). */
export const keluhanTpuMessages: Record<string, string> = {
  input_tidak_valid: "Tulis keluhan Anda dengan singkat.",
  bukan_pemesan: "Email ini bukan email akun Anda, jadi keluhan tidak bisa diajukan.",
  tidak_ditemukan: "Pesanan ini tidak ada di akun Anda.",
  belum_selesai: "Pekerjaan ini belum selesai, jadi belum ada yang bisa dikeluhkan.",
  jendela_tertutup: "Batas 3×24 jam untuk mengajukan keluhan sudah lewat. Hubungi kami bila masih ada yang mengganjal.",
  sudah_ada: "Keluhan untuk pekerjaan ini sudah pernah diajukan.",
  belum_masuk: "Masuk dulu untuk mengajukan keluhan.",
  perlu_totp: "Masukkan kode dari aplikasi authenticator Anda dulu.",
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
};

/** What a Keluhan on a TPU job means to the Pemesan, so the order page says what happens next. */
export const keluhanTpuPenjelasan = {
  terbuka: "Keluhan Anda sudah kami terima. Tim kami akan menghubungi Anda dan memutuskan apakah pekerjaan dikerjakan ulang.",
  ditolak: "Keluhan Anda sudah kami periksa dan tidak dapat dilanjutkan. Pekerjaan tetap dianggap selesai.",
  kerjakan_ulang: "Pekerjaan akan dikerjakan ulang oleh Mitra Jasa. Bukti baru akan tampil di sini begitu disetujui.",
  dana_kembali: "Keluhan Anda disetujui: harga layanan ini akan dikembalikan. Kami akan menghubungi Anda untuk pengembaliannya.",
} as const;

/** Why Admin Platform's decision on a Keluhan of a TPU job is refused (ticket 57). */
export const putuskanKeluhanTpuMessages: Record<string, string> = {
  input_tidak_valid: "Pilih keputusan dan tulis catatannya. Untuk kerjakan ulang, pilih juga Mitra Jasa-nya.",
  tidak_ditemukan: "Keluhan ini tidak ditemukan.",
  sudah_diputuskan: "Keluhan ini sudah diputuskan.",
  mitra_jasa_tidak_tersedia: "Mitra Jasa itu tidak bisa mengerjakan ulang pekerjaan ini. Keluhan tetap terbuka: pilih yang lain.",
  pengembalian_tidak_bisa_diajukan: "Pengembalian dana belum bisa diajukan untuk pesanan ini (belum lunas atau barisnya tidak ditemukan). Keluhan tetap terbuka.",
  pengembalian_tertunda: "Masih ada permintaan pengembalian yang menunggu di tagihan ini. Selesaikan dulu, lalu putuskan keluhan ini.",
};

/** Why cancelling a Terlambat TPU job is refused (ticket 57). */
export const batalkanPekerjaanTerlambatTpuMessages: Record<string, string> = {
  input_tidak_valid: "Tulis alasan pembatalan.",
  tidak_ditemukan: "Pekerjaan ini tidak ditemukan.",
  bukan_terlambat: "Hanya pekerjaan yang sudah Terlambat yang bisa dibatalkan di sini.",
  pengembalian_tidak_bisa_diajukan: "Pengembalian dana belum bisa diajukan untuk pesanan ini. Pekerjaan belum dibatalkan.",
  pengembalian_tertunda: "Masih ada permintaan pengembalian yang menunggu di tagihan ini. Selesaikan dulu, lalu batalkan pekerjaan ini.",
};

/** Where a refund on a TPU order stands, in the family's words (ticket 120): asked, approved by Admin Platform, or sent. */
export const pengembalianPesananLabels: Record<PengembalianPesanan["status"], string> = {
  diajukan: "menunggu persetujuan Admin Platform",
  disetujui: "sudah disetujui, menunggu transfer",
  ditransfer: "sudah ditransfer",
};
