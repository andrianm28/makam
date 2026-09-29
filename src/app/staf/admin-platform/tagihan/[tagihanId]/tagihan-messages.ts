/**
 * Bahasa Indonesia for every refusal this page's own actions can return, one
 * function per action so each says what to do next. The reason codes are
 * Billing's and Payouts' own; the wording is the screen's. Beside `actions.ts`
 * because a "use server" file may export only async functions.
 */

/** Why a manual payment was refused, saying what to do next. */
export function pembayaranManualMessage(reason: string): string {
  switch (reason) {
    case "tidak_ditemukan":
      return "Tagihan ini tidak ditemukan.";
    case "sudah_lunas":
      return "Tagihan ini sudah Lunas, jadi pembayarannya sudah tercatat lewat jalan lain. Tidak ada Bukti Pembayaran kedua.";
    case "tagihan_dibatalkan":
      return "Tagihan ini sudah dibatalkan, jadi tidak bisa dibayar lagi.";
    case "batas_pembayaran_lewat":
      return "Pembayaran ini sudah lewat batas waktu Tagihan, jadi tidak bisa dicatat di sini.";
    case "waktu_pembayaran_tidak_valid":
      return "Waktu pembayaran harus waktu yang benar dan tidak di masa depan.";
    case "berkas_tidak_didukung":
      return "Bukti pembayaran harus foto (JPG, PNG) atau PDF, paling besar 10 MB.";
    case "pengaturan_operator_belum_diisi":
      return "Pengaturan Operator belum diisi, jadi Bukti Pembayaran tidak bisa diterbitkan.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}

/** Why a Harga Khusus was refused, saying what to do next. */
export function hargaKhususMessage(reason: string): string {
  switch (reason) {
    case "tidak_ditemukan":
      return "Tagihan ini tidak ditemukan.";
    case "tagihan_tidak_bisa_diganti":
      return "Tagihan ini sudah Lunas, dibatalkan, atau sudah lewat jatuh tempo, jadi tidak bisa diganti.";
    case "input_tidak_valid":
      return "Isi jumlah pengurangan dan alasannya. Catatan wajib diisi bila bagian Lokasi Mitra lebih dari nol.";
    case "harga_khusus_melebihi_total":
      return "Pengurangan lebih besar dari total Tagihan.";
    case "porsi_melebihi_pengurangan":
      return "Bagian yang ditanggung Lokasi Mitra tidak boleh melebihi pengurangannya.";
    case "porsi_tidak_berlaku":
      return "Tagihan ini bukan milik pesanan sebuah Lokasi Mitra, jadi tidak ada Pencairan yang bisa dikurangi.";
    case "porsi_tidak_dapat_dikurangi":
      return "Bagian Lokasi Mitra tidak bisa dicatat sekarang. Coba lagi, atau hubungi tim teknis.";
    case "jumlah_terlalu_besar":
      return "Jumlah ini terlalu besar.";
    case "melebihi_batas_qris":
      return "Total Tagihan baru akan melebihi batas Rp 10.000.000.";
    case "pengaturan_operator_belum_diisi":
      return "Pengaturan Operator belum diisi.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}

/** Why a direct-payment reversal was refused, saying what to do next. */
export function batalkanMessage(reason: string): string {
  switch (reason) {
    case "tidak_ditemukan":
      return "Tagihan ini belum ada pembayaran yang tercatat sama sekali.";
    case "bukan_dibayar_langsung":
      return "Tagihan ini tidak dibayar langsung ke Lokasi Mitra, jadi tidak ada yang perlu dibatalkan.";
    case "sudah_dibatalkan":
      return "Pembayaran langsung ini sudah dibatalkan sebelumnya.";
    case "sudah_dipotong":
      return "Potongan untuk pembayaran ini sudah tercatat dalam Bukti Pencairan atau lunas offline, jadi tidak bisa dibatalkan lagi.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}
