/**
 * Bahasa Indonesia for every refusal the Pemesanan module can return to the Admin
 * Lokasi's screens for a Pemesanan Terencana (ticket 37), one function per action so
 * each says what to do next. The reason codes are the module's own, and each switch is
 * exhaustive over them: a reason the module adds fails the typecheck here.
 */
import type { KonfirmasiTerencanaResult, TolakTerencanaResult } from "@/domain/pemesanan";

type Refusal<R extends { ok: boolean }> = Extract<R, { ok: false; reason: string }>["reason"];

const TIDAK_BERWENANG = "Anda tidak berwenang untuk pesanan ini.";
const PESANAN_TIDAK_DITEMUKAN = "Pesanan tidak ditemukan.";

/** Why a confirmation was refused, saying what to do next. */
export function konfirmasiTerencanaMessage(reason: Refusal<KonfirmasiTerencanaResult>): string {
  switch (reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return TIDAK_BERWENANG;
    case "input_tidak_valid":
      return "Nomor pesanan tidak valid.";
    case "pesanan_tidak_ditemukan":
      return PESANAN_TIDAK_DITEMUKAN;
    case "pesanan_sudah_dikonfirmasi":
      return "Pesanan ini sudah dikonfirmasi. Petak ditahan dan Tagihannya sudah terbit.";
    case "pesanan_sudah_ditutup":
      return "Pesanan ini sudah ditutup (ditolak atau dibatalkan), jadi tidak bisa dikonfirmasi.";
    case "harga_tidak_tersedia":
      return "Harga salah satu jenis makam pada pesanan ini belum tersedia atau sudah berubah. Periksa Tarif dulu.";
    case "melebihi_batas_qris":
      return "Total Tagihan melebihi batas pembayaran QRIS Rp 10.000.000. Tolak pesanan ini atau hubungi Admin Platform.";
    case "lokasi_tidak_terbuka":
      return "Lokasi Mitra ini tidak lagi tayang, jadi pesanan tidak bisa dikonfirmasi.";
    case "tagihan_tidak_terbit":
      return "Tagihan belum bisa terbit. Minta Admin Platform mengisi Pengaturan Operator, lalu coba lagi.";
    case "layanan_tidak_tersedia":
      return "Layanan yang dipilih keluarga tidak bisa ditawarkan lagi (dimatikan, belum berharga, atau tanggalnya terlalu dekat). Hubungi Admin Platform atau tolak pesanan ini.";
  }
}

/** Why a Tolak was refused, saying what to do next. */
export function tolakTerencanaMessage(reason: Refusal<TolakTerencanaResult>): string {
  switch (reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return TIDAK_BERWENANG;
    case "input_tidak_valid":
      return "Pilih salah satu alasan dari daftar.";
    case "pesanan_tidak_ditemukan":
      return PESANAN_TIDAK_DITEMUKAN;
    case "pesanan_sudah_ditutup":
      return "Pesanan ini sudah dijawab atau ditutup, jadi tidak bisa ditolak lagi.";
  }
}
