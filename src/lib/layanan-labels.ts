import type { AlasanTolakPesanan, BuktiPekerjaan, PekerjaanLayananStatus } from "@/domain/layanan";
import type { Bukti, Frekuensi, JenisLayanan, ProofRequirement } from "@/domain/layanan";
import type { QuotedLine } from "@/domain/tariffs";
import { quoteLineLabel } from "./quote-line-label";

/**
 * How the Layanan catalog's own words are named on screen (CONTEXT.md): what kind
 * of Layanan an entry is, the proof it requires, one part of a Layanan price, and
 * a Paket Layanan's frequency. The wording lives here, once, outside the domain.
 */

/** What kind of Layanan a catalog entry is (spec, decision ticket 09: the v1 list). */
export const jenisLayananLabels: Record<JenisLayanan, string> = {
  bunga: "Bunga",
  nisan: "Batu Nisan",
  pembersihan: "Pembersihan Makam",
  perawatan: "Perawatan Rumput & Taman",
  laporan: "Laporan Foto/Video",
};

/** The proof level a kind of Layanan carries, as it is stored and shown. */
export const buktiLabels: Record<Bukti, string> = {
  foto_sesudah: "Foto setelah",
  foto_sebelum_dan_sesudah: "Foto sebelum dan sesudah",
  foto_dan_video: "Foto dan video",
};

/** What a job's proof must contain, in the words a fulfiller and a Pemesan read. */
export function proofLabels(proof: ProofRequirement): string {
  const wajib = ["Foto setelah"];
  if (proof.fotoSebelum) wajib.push("Foto sebelum");
  if (proof.video) wajib.push("Video");
  return wajib.join(", ");
}

/**
 * One part of a Layanan price: the Layanan variant it belongs to, named from the
 * catalog that owns the name, or any other line named by `quoteLineLabel` (the
 * one wording for the Tariffs module's own lines).
 */
export function hargaLayananPartLabel(line: QuotedLine, varian?: { namaLayanan: string; name: string }): string {
  if (line.kind !== "layanan_lokasi" && line.kind !== "layanan_dki") return quoteLineLabel(line);
  return varian ? `Layanan – ${varian.namaLayanan} (${varian.name})` : "Layanan";
}

/** One part of a Layanan price: its name, its amount, and when each changes. */
export interface HargaLayananPart {
  label: string;
  amount: number;
  inForceSince: string;
  scheduledChange: { effectiveOn: string; amount: number } | null;
}

/** How often a Paket Layanan repeats. */
export const frekuensiLabels: Record<Frekuensi, string> = {
  sekali: "Sekali",
  bulanan: "Bulanan",
  tiga_bulanan: "3-bulanan",
  tahunan: "Tahunan",
};

/**
 * The order a family places and the work it becomes (spec, Layanan > Order and
 * Pekerjaan Layanan). The wording lives here, once, outside the domain: the module
 * carries the statuses and the facts, and every screen and message reads these.
 */

/** One piece of photo proof, as a fulfiller and a Pemesan read it. */
export const buktiPekerjaanLabels: Record<BuktiPekerjaan, string> = {
  foto_sebelum: "Foto sebelum",
  foto_sesudah: "Foto sesudah",
  video: "Video",
};

/** One piece of photo proof, by name. */
export function labelBuktiPekerjaan(kind: BuktiPekerjaan): string {
  return buktiPekerjaanLabels[kind];
}

/** An order Layanan's own status, in the words its Pemesan reads. */
export const pesananLayananLabels = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  terbayar: "Sudah Dibayar",
} as const;

/** A Pekerjaan Layanan's status, in the words a Pemesan and an Admin Lokasi read. */
export const pekerjaanLayananLabels = {
  menunggu_pembayaran: "Menunggu Pembayaran",
  dijadwalkan: "Dijadwalkan",
  sedang_dikerjakan: "Sedang Dikerjakan",
  terlambat: "Terlambat",
  selesai: "Selesai",
  dibatalkan: "Dibatalkan",
  /** A complaint sits against a finished job; deciding it is Admin Platform's. */
  keluhan: "Keluhan",
} as const satisfies Record<PekerjaanLayananStatus, string>;

/** Why a job was cancelled, in the words the Pemesan and the staff read. */
export const pembatalanLayananLabels = {
  /** The Pemesan changed their mind, and the platform fee is kept. */
  pemesan_batal: "Dibatalkan oleh pemesan; biaya layanan platform tidak dikembalikan.",
  /** The job ran late, so the whole Tagihan is refunded. */
  terlambat_batal: "Dibatalkan karena pekerjaan terlambat; seluruh Tagihan dikembalikan.",
} as const;

/**
 * Why an order could not be placed, saying what to do next rather than only what
 * went wrong. A `Record` over the module's own union, so a new refusal reason
 * cannot reach a screen without a sentence.
 */
export const layananOrderMessages: Record<AlasanTolakPesanan | "belum_masuk" | "perlu_totp" | "tidak_berwenang", string> = {
  input_tidak_valid: "Periksa lagi isian Anda.",
  grave_tidak_ditemukan: "Makam ini tidak ditemukan. Cari ulang lewat Makam Keluarga.",
  lokasi_tidak_terbuka: "Lokasi Mitra ini sudah tidak menerima pesanan layanan. Pilih Lokasi Mitra lain.",
  // Names only Berakhir, because only Berakhir blocks. A given-back (Dibatalkan)
  // Hak Pakai may still be ordered for, by the owner's settled decision: with a
  // one-way block, one failed service would prevent every other service the family
  // has already paid for. So this sentence must not widen itself to cover it again.
  hak_pakai_berakhir: "Hak Pakai di makam ini sudah Berakhir, jadi layanan tidak bisa dipesan. Hubungi pengelola Lokasi Mitra.",
  layanan_tidak_tersedia: "Layanan ini tidak tersedia di Lokasi Mitra tersebut. Pilih dari daftar yang tersedia.",
  baris_tidak_bisa_ditagih: "Harga layanan ini belum bisa ditagihkan. Periksa tarif Lokasi Mitra ini.",
  lead_time_melewati: "Tanggal yang dipilih masih di dalam masa tunggu layanan. Pilih tanggal yang lebih jauh.",
  teks_kosong: "Layanan ini minta isian tambahan. Isi dulu kolomnya.",
  harga_tidak_tersedia: "Harga layanan ini belum tersedia atau sudah berubah. Kembali ke halaman layanan.",
  tagihan_tidak_terbit: "Tagihan belum bisa diterbitkan, jadi pesanan tidak jadi dibuat. Periksa Pengaturan Operator.",
  email_bukan_akun_ini: "Email ini bukan email akun Anda. Kirim ulang dengan email lain.",
  belum_masuk: "Masuk dulu untuk memesan layanan.",
  perlu_totp: "Masukkan kode dari aplikasi authenticator Anda dulu.",
  nomor_tidak_valid: "Nomor telepon belum lengkap. Tulis ulang dengan nomor yang bisa dihubungi.",
  nomor_bukan_indonesia: "Nomor telepon harus berawalan 08 atau berformat luar negeri.",
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
};

/** The message for a refusal, saying what to do next. */
export function layananOrderMessage(reason: keyof typeof layananOrderMessages): string {
  return layananOrderMessages[reason];
}

/** Why a cancellation is refused, saying what to do next. */
export const layananBatalMessages = {
  input_tidak_valid: "Tulis alasan pembatalan.",
  tidak_ditemukan: "Pesanan ini tidak ada di akun Anda.",
  bukan_pemesan: "Email ini bukan email akun Anda, jadi pesanannya tidak bisa dibatalkan.",
  sudah_dibatalkan: "Pekerjaan ini sudah dibatalkan.",
  sudah_selesai: "Pekerjaan ini sudah selesai, jadi tidak bisa dibatalkan.",
  di_keluhan: "Pekerjaan ini sedang dalam keluhan, jadi tidak bisa dibatalkan.",
  sudah_dikerjakan: "Pekerjaan ini sudah lewat batas pembatalan (H-1), sudah dikerjakan, atau pembayarannya belum masuk.",
  belum_masuk: "Masuk dulu untuk membatalkan pekerjaan ini.",
  perlu_totp: "Masukkan kode dari aplikasi authenticator Anda dulu.",
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
} as const satisfies Record<string, string>;

/** The message for a staff step on a job, saying what to do next. */
export const pekerjaanPesanMessages = {
  tidak_ditemukan: "Pekerjaan ini tidak ditemukan.",
  input_tidak_valid: "Periksa lagi isian Anda.",
  belum_dijadwalkan: "Pekerjaan ini belum menunggu pembayaran, jadi belum bisa dikerjakan.",
  sudah_dikerjakan: "Pekerjaan ini sudah selesai atau sedang dikerjakan.",
  sudah_dibatalkan: "Pekerjaan ini sudah dibatalkan atau sedang dalam keluhan.",
  bukti_belum_lengkap: "Bukti wajib belum lengkap, jadi pekerjaan belum bisa ditandai selesai.",
  berkas_tidak_didukung: "Berkas ini tidak didukung. Ambil ulang fotonya dari kamera.",
  penyimpanan_belum_tersedia: "Penyimpanan berkas belum tersedia, jadi bukti belum bisa disimpan.",
  belum_masuk: "Masuk dulu untuk mengerjakan layanan ini.",
  tidak_berwenang: "Anda tidak berwenang melakukan ini.",
  perlu_totp: "Masukkan kode dari aplikasi authenticator Anda dulu.",
  tidak_perlu_verifikasi: "Hak Pakai petak ini sudah lengkap.",
} as const satisfies Record<string, string>;
