/**
 * Bahasa Indonesia for every refusal the Pemesanan module can return to the Admin
 * Lokasi's screens for a Pemesanan Terencana (ticket 37), one function per action so
 * each says what to do next. The reason codes are the module's own; the wording is the
 * screen's.
 */

const PESANAN_TIDAK_DITEMUKAN = "Pesanan tidak ditemukan.";

/** Why a confirmation was refused, saying what to do next. */
export function konfirmasiTerencanaMessage(reason: string): string {
  switch (reason) {
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
    default:
      return "Pesanan belum bisa dikonfirmasi.";
  }
}

/** Why a Tolak was refused, saying what to do next. */
export function tolakTerencanaMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return PESANAN_TIDAK_DITEMUKAN;
    case "pesanan_sudah_ditutup":
      return "Pesanan ini sudah dijawab atau ditutup, jadi tidak bisa ditolak lagi.";
    default:
      return "Pilih salah satu alasan dari daftar.";
  }
}
