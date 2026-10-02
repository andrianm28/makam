/** Why the Admin Lokasi's ending of a Hak Pakai, or its Pembongkaran, was refused, saying what to do next. */
export function akhiriHakPakaiText(reason: string): string {
  switch (reason) {
    case "tidak_ditemukan":
      return "Hak Pakai tidak ditemukan di Lokasi Mitra ini.";
    case "hak_pakai_sudah_berakhir":
      return "Hak Pakai ini sudah berakhir atau dibatalkan.";
    case "tidak_berwenang":
      return "Anda tidak berwenang mengakhiri Hak Pakai ini.";
    default:
      return "Alasan wajib diisi.";
  }
}

export function pembongkaranText(reason: string): string {
  switch (reason) {
    case "tidak_ditemukan":
      return "Hak Pakai tidak ditemukan di Lokasi Mitra ini.";
    case "hak_pakai_belum_berakhir":
      return "Hak Pakai ini belum berakhir. Akhiri dulu, baru catat Pembongkaran.";
    case "sudah_dibongkar":
      return "Pembongkaran Hak Pakai ini sudah dicatat.";
    case "tidak_berwenang":
      return "Anda tidak berwenang mencatat Pembongkaran ini.";
    default:
      return "Periksa lagi isian Anda.";
  }
}
