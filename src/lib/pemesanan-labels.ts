import type { WorkingTimeResult } from "@/domain/lokasi";
import type { PemesananStatus } from "@/domain/pemesanan";
import type { Tenure } from "@/domain/tariffs";
import type { StatusKey } from "@/components/makam/status-badge";
import { formatTanggalJam } from "@/lib/time/jakarta";

/**
 * How the Pemesanan module's words reach a family: the Bahasa Indonesia for
 * every refusal a Kirim can meet, the Masa Hak Pakai a card states, and the
 * confirmation promise the working-time calculator answers. The module carries
 * the facts; the wording lives here, once.
 */

/** Every reason a Kirim can be refused: the module's own, and the guard's. */
export type PemesananRefusal =
  | "email_bukan_akun_ini"
  | "lokasi_tidak_terbuka"
  | "harga_tidak_tersedia"
  | "pemesan_kosong"
  | "almarhum_kosong"
  | "pemegang_hak_almarhum"
  | "tidak_berwenang"
  | "perlu_totp"
  | "input_tidak_valid";

/** The message for a refusal, saying what to do next rather than only what went wrong. */
export function pemesananMessage(reason: PemesananRefusal): string {
  switch (reason) {
    case "email_bukan_akun_ini":
      return "Email ini bukan email akun Anda. Kirim ulang dengan email lain.";
    case "lokasi_tidak_terbuka":
      return "Lokasi Mitra ini sudah tidak menerima pesanan. Pilih Lokasi Mitra lain.";
    case "harga_tidak_tersedia":
      return "Harga makam ini belum tersedia atau sudah berubah. Kembali ke pilihan makam.";
    case "pemesan_kosong":
      return "Tulis nama lengkap Anda.";
    case "almarhum_kosong":
      return "Tulis nama almarhum / almarhumah.";
    case "pemegang_hak_almarhum":
      return "Pemegang Hak tidak boleh almarhum / almarhumah. Pilih Pemegang Hak lain.";
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

/** The Masa Hak Pakai a card or an order words. */
export function tenureLabel(tenure: Tenure): string {
  return tenure.kind === "selamanya" ? "selamanya" : `${tenure.years} tahun`;
}

/**
 * The confirmation promise, as a card says it: when the Lokasi will confirm at
 * the latest, or that it cannot promise one (no Jam Operasional to count in).
 */
export function konfirmasiLabel(batas: WorkingTimeResult): string {
  if (batas.ok) return `Dikonfirmasi paling lambat ${formatTanggalJam(batas.at)}`;
  return batas.reason === "jam_operasional_belum_diisi"
    ? "Lokasi Mitra ini belum membuka jam operasionalnya, jadi belum ada janji konfirmasi."
    : "Lokasi Mitra ini belum punya jam buka, jadi belum ada janji konfirmasi.";
}

/** A Pemesanan Makam's status as the shared status vocabulary spells it. */
export function pemesananStatusKey(status: PemesananStatus): StatusKey {
  return status;
}
