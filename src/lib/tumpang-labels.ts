/** What a further burial's refusals say to the person who met them (content, not a rule). */
const TEKS: Record<string, string> = {
  input_tidak_valid: "Periksa lagi isian Anda.",
  pesanan_tidak_ditemukan: "Pesanan tidak ditemukan.",
  bukan_pemegang_hak: "Hanya Pemegang Hak yang boleh menjawab permintaan ini. Masuk dengan email yang tercatat untuk Pemegang Hak.",
  konsen_sudah_diputuskan: "Persetujuan ini sudah dijawab.",
  konsen_belum_selesai: "Persetujuan Pemegang Hak belum selesai.",
  tumpang_tidak_diizinkan: "Lokasi Mitra ini tidak mengizinkan tumpang.",
  tumpang_petak_dilepas_tidak_diizinkan: "Lokasi Mitra ini tidak mengizinkan tumpang pada petak yang sudah dilepas.",
  lapisan_penuh: "Jumlah lapisan maksimum sudah tercapai.",
  masa_tunggu_belum_lewat: "Masa tunggu sejak pemakaman terakhir belum lewat.",
  hak_pakai_tidak_ditemukan: "Hak Pakai tidak ditemukan.",
  petak_tidak_ditemukan: "Pilih petak yang termasuk dalam Kavling Keluarga ini.",
  email_bukan_akun_ini: "Email ini bukan email akun Anda. Kirim ulang dengan email lain.",
  kontak_pemesan_kosong: "Nomor telepon Pemesan belum ada.",
  harga_tidak_tersedia: "Harga belum tersedia.",
  pesanan_sudah_dikonfirmasi: "Pesanan sudah dikonfirmasi.",
  pesanan_sudah_ditutup: "Pesanan sudah ditutup.",
};

export function tumpangMessage(reason: string): string {
  return TEKS[reason] ?? "Permintaan tidak dapat diproses.";
}
