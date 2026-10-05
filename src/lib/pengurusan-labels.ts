import type { WorkingTimeResult } from "@/domain/lokasi";
import type { PengurusanTpuKind } from "@/domain/pengurusan";
import { formatTanggalJam } from "@/lib/time/jakarta";

/**
 * How the Pengurusan module's words reach a family: the Bahasa Indonesia for
 * every refusal a Kirim can meet, and the confirmation promise the TPU window
 * answers. The module carries the facts; the wording lives here, once — as
 * `@/lib/pemesanan-labels` does for a Pemesanan Makam.
 */

/** Every reason a Saat Duka TPU Kirim can be refused: the module's own, and the guard's. */
export type PengurusanRefusal =
  | "email_bukan_akun_ini"
  | "tpu_tidak_ada"
  | "tpu_tidak_menerima_makam_baru"
  | "kelayakan_tidak_terpenuhi"
  | "kuburan_kosong"
  | "foto_iptm_kosong"
  | "foto_iptm_terlalu_besar"
  | "berkas_tidak_didukung"
  | "berkas_gagal_disimpan"
  | "harga_tidak_tersedia"
  | "pemesan_kosong"
  | "almarhum_kosong"
  | "pemegang_hak_almarhum"
  | "layanan_tidak_tersedia"
  | "teks_kosong"
  | "tidak_berwenang"
  | "perlu_totp"
  | "input_tidak_valid";

/** The message for a refusal, saying what to do next rather than only what went wrong. */
export function pengurusanMessage(reason: PengurusanRefusal): string {
  switch (reason) {
    case "email_bukan_akun_ini":
      return "Email ini bukan email akun Anda. Kirim ulang dengan email lain.";
    case "tpu_tidak_ada":
      return "TPU ini tidak ada di daftar kami. Kembali ke pilihan TPU.";
    case "tpu_tidak_menerima_makam_baru":
      return "TPU ini sedang tidak menerima makam baru. Pilih TPU lain, atau Lokasi Mitra.";
    case "kelayakan_tidak_terpenuhi":
      return "Pemakaman di TPU DKI hanya untuk warga dengan KTP DKI atau yang meninggal di Jakarta. Lokasi Mitra menerima pemakaman tanpa syarat itu.";
    case "kuburan_kosong":
      return "Tulis blok dan nomor makam yang akan ditumpang, serta nama almarhum yang sudah ada di sana.";
    case "foto_iptm_kosong":
      return "Unggah foto IPTM makam yang akan ditumpang, supaya izin yang masih berlaku bisa kami periksa.";
    case "foto_iptm_terlalu_besar":
      return "Foto IPTM terlalu besar. Ambil ulang foto yang lebih kecil, atau pindai jadi satu berkas PDF.";
    case "berkas_tidak_didukung":
      return "Foto IPTM harus berupa foto (JPG, PNG atau WebP) atau pindai PDF. Coba unggah ulang.";
    case "berkas_gagal_disimpan":
      return "Foto IPTM gagal disimpan. Coba lagi sebentar, atau minta bantuan CS.";
    case "harga_tidak_tersedia":
      return "Harga di TPU ini belum tersedia atau sudah berubah. Kembali ke pilihan TPU.";
    case "pemesan_kosong":
      return "Tulis nama lengkap Anda.";
    case "almarhum_kosong":
      return "Tulis nama almarhum / almarhumah.";
    case "pemegang_hak_almarhum":
      return "Pemegang Hak tidak boleh almarhum / almarhumah. Pilih Pemegang Hak lain.";
    case "layanan_tidak_tersedia":
      return "Layanan hari-H yang Anda pilih belum tersedia di TPU atau harganya sudah berubah. Pilih ulang layanannya.";
    case "teks_kosong":
      return "Layanan yang Anda pilih meminta tulisan. Isi tulisannya atau lepaskan layanan itu.";
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    case "perlu_totp":
      return "Masukkan kode dari aplikasi authenticator Anda dulu.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda.";
  }
  // Exhaustive: a new refusal reason fails the typecheck here until it has a message.
  const unhandled: never = reason;
  throw new Error(`No message for ${String(unhandled)}`);
}

/**
 * The confirmation promise a TPU card and the order page say it: two service
 * hours on the TPU window, so a submission at 23:00 is confirmed by 08:00.
 */
export function konfirmasiTpuLabel(batas: WorkingTimeResult): string {
  if (batas.ok) return `Dikonfirmasi paling lambat ${formatTanggalJam(batas.at)}`;
  return "Jadwal konfirmasi TPU ini belum bisa dihitung. Hubungi CS bila lupa.";
}

/**
 * What a Pemesan is told about the refund when cancelling an order of this kind (spec, Pengurusan; story 77). The rule is the
 * Pengurusan module's (`batalkanPengurusan`): an unpaid Tagihan is voided, and a paid one is refunded in full except the Biaya
 * Pengurusan once the order is at Dimakamkan or later. Only its wording is here, in the words of the order's own kind: a Saat
 * Duka TPU order has a burial the Operator arranged with the TPU, a filing-only order has none (the family buried on its own and
 * the order starts at Dimakamkan), so it speaks of the filing, and a Perpanjangan TPU order keeps nothing back.
 */
export function catatanPembatalanPengurusan(kind: PengurusanTpuKind): string {
  switch (kind) {
    case "saat_duka_tpu":
      return "Tagihan yang belum dibayar dibatalkan; yang sudah dibayar dikembalikan, kecuali Biaya Pengurusan sejak pemakaman diatur dengan TPU.";
    case "pengurusan_iptm":
      return "Tagihan yang belum dibayar dibatalkan; yang sudah dibayar dikembalikan, kecuali Biaya Pengurusan sejak berkas IPTM mulai kami urus.";
    case "perpanjangan_tpu":
      return "Tagihan yang belum dibayar dibatalkan.";
  }
}
