/**
 * Bahasa Indonesia for every refusal the Pemesanan module can return to this
 * area's own screens, one function per action so each says what to do next.
 *
 * The reason codes are the module's own and the wording is the screen's, so this
 * file is where the two meet — beside `denah-messages.ts`, which does the same
 * for the Denah. The two reasons **every** exit of this page shares are written
 * once here rather than four times, because a page that refuses the same thing
 * four different ways reads as four different rules.
 */

/** Every action of this page refuses an unknown order in the same words. */
const PESANAN_TIDAK_DITEMUKAN = "Pesanan tidak ditemukan.";

/** The one refusal whose wording is a sentence apart from its action's verb. */
function ditutup(apa: string): string {
  return `Pesanan ini sudah ditutup, jadi tidak bisa ${apa}.`;
}

/** Why a Tolak was refused, saying what to do next. */
export function tolakMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return PESANAN_TIDAK_DITEMUKAN;
    case "pesanan_sudah_ditutup":
      return ditutup("ditolak");
    default:
      return "Pilih salah satu alasan dari daftar.";
  }
}

/** Why an alternative was refused, saying what to do next. */
export function alternatifMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return PESANAN_TIDAK_DITEMUKAN;
    case "pesanan_sudah_ditutup":
      return ditutup("ditawarkan alternatif");
    case "alternatif_kosong":
      return "Pilih jenis makam lain atau tanggal lain. Minimal satu harus berubah.";
    case "jenis_makam_tidak_ditemukan":
      return "Jenis makam itu bukan milik Lokasi Mitra ini. Pilih dari daftar.";
    case "harga_tidak_tersedia":
      return "Harga jenis makam itu belum tersedia atau sudah berubah, jadi tidak bisa ditawarkan.";
    default:
      return "Alternatif belum bisa ditawarkan.";
  }
}

/** Why a cancellation was refused, saying what to do next. */
export function batalkanMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return PESANAN_TIDAK_DITEMUKAN;
    case "pesanan_sudah_ditutup":
      return ditutup("dibatalkan");
    case "alasan_wajib":
      return "Tulis alasan pembatalan. Setelah pesanan dikonfirmasi, keluarga berhak tahu alasannya.";
    case "pemakaman_sudah_dicatat":
      return "Petak sudah dipakai untuk pemakaman, jadi tidak bisa dikembalikan. Catat keluhannya sebagai Pemakaman di bawah Hak Pakai.";
    case "hak_pakai_tidak_ditemukan":
    case "hak_pakai_sudah_berakhir":
      return "Hak Pakai pesanan ini sudah berakhir, jadi tidak ada yang bisa dikembalikan.";
    default:
      return "Pesanan belum bisa dibatalkan. Periksa Tagihan pesanan ini lebih dulu.";
  }
}

/** Why a burial could not be recorded, saying what to do next (ticket 25). */
export function catatPemakamanMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return PESANAN_TIDAK_DITEMUKAN;
    case "pesanan_belum_dikonfirmasi":
      return "Pesanan ini belum dikonfirmasi, jadi belum ada petak untuk dimakamkan. Konfirmasi dulu.";
    case "pemakaman_sudah_dicatat":
      return "Pemakaman pesanan ini sudah dicatat. Yang dicatat adalah pemakaman pertama, dan itu yang menghitung.";
    case "tanggal_pemakaman_tidak_valid":
      return "Tanggal pemakaman tidak valid. Tanggal hari ini atau sebelumnya, sesuai zona waktu lokasi.";
    case "tagihan_tidak_ditemukan":
      return "Tagihan pesanan ini tidak ditemukan, jadi pemakaman tidak bisa dicatat. Periksa di Tagihan.";
    case "hak_pakai_tidak_ditemukan":
    case "petak_tidak_ditemukan":
      return "Hak Pakai petak ini tidak ditemukan, jadi pemakaman tidak bisa dicatat. Periksa Denah Lokasi Mitra ini.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}

/** Why a confirmation was refused, saying what to do next. */
export function konfirmasiMessage(reason: string): string {
  switch (reason) {
    case "pesanan_tidak_ditemukan":
      return PESANAN_TIDAK_DITEMUKAN;
    case "pesanan_sudah_dikonfirmasi":
      return "Pesanan ini sudah dikonfirmasi, jadi petaknya tidak berubah.";
    // Worded apart from `ditutup()` on purpose: this sentence predates it, and a
    // confirmation says the order is closed rather than merely taken away.
    case "pesanan_sudah_ditutup":
      return "Pesanan ini sudah ditutup, tidak bisa dikonfirmasi.";
    case "petak_tidak_ditemukan":
      return "Petak ini bukan milik Lokasi Mitra ini. Pilih dari daftar.";
    case "petak_belum_tersedia":
      return "Petak ini sudah terisi atau belum dicek. Bersihkan di Denah lebih dulu, atau pilih petak lain.";
    case "jenis_makam_beda":
      return "Petak ini bukan jenis makam yang dipesan. Pilih petak lain.";
    case "kontak_pemesan_kosong":
      return "Pesan ini tidak punya nomor telepon untuk Tagihan. Minta nomor kepada keluarga, lalu konfirmasi lagi.";
    case "harga_tidak_tersedia":
      return "Harga Hak Pakai ini belum tersedia atau sudah berubah. Periksa tarif Lokasi Mitra ini.";
    case "tagihan_tidak_terbit":
      return "Tagihan belum bisa diterbitkan, jadi pesanan tidak jadi dikonfirmasi. Periksa Pengaturan Operator.";
    case "lokasi_tidak_dibuka":
      return "Lokasi Mitra ini tidak ditemukan.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}

/** Why a direct payment was refused, saying what to do next. */
export function pembayaranLangsungMessage(reason: string): string {
  switch (reason) {
    case "tidak_ditemukan":
      return "Tagihan ini tidak ditemukan.";
    case "sudah_lunas":
      return "Tagihan ini sudah Lunas, jadi pembayarannya sudah tercatat lewat jalan lain.";
    case "tagihan_dibatalkan":
      return "Tagihan ini sudah dibatalkan, jadi tidak bisa dibayar lagi.";
    case "batas_pembayaran_lewat":
      return "Pembayaran ini sudah lewat batas waktu Tagihan.";
    case "berkas_tidak_didukung":
      return "Bukti pembayaran harus foto (JPG, PNG) atau PDF, paling besar 10 MB.";
    case "bukan_lokasi_mitra":
      return "Tagihan ini bukan tagihan Lokasi Mitra, jadi tidak bisa dicatat dibayar langsung.";
    case "pengaturan_operator_belum_diisi":
      return "Pengaturan Operator belum diisi, jadi Bukti Pembayaran tidak bisa diterbitkan.";
    case "perlu_totp":
    case "tidak_berwenang":
      return "Anda tidak berwenang melakukan ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}
