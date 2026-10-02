/** What a thread message form's Server Action carries back to the screen (ticket 52). */
export type PesanThreadState = { status: "idle" } | { status: "gagal"; message: string } | { status: "berhasil"; message: string };

/** The words for each refusal of a thread message, in the design system's plain Bahasa. */
export const pesanThreadMessages: Record<
  "input_tidak_valid" | "tertutup" | "kontak_tidak_boleh" | "berkas_tidak_didukung" | "penyimpanan_belum_tersedia" | "tidak_ditemukan" | "bukan_pemesan" | "tidak_berwenang" | "perlu_totp" | "belum_masuk",
  string
> = {
  input_tidak_valid: "Tulis pesan atau lampirkan foto (paling banyak tiga, JPG, PNG atau WebP).",
  tertutup: "Percakapan ini sudah ditutup karena masa keluhan berakhir. Anda masih bisa membacanya.",
  kontak_tidak_boleh: "Nomor telepon dan alamat email tidak boleh dikirim lewat percakapan ini. Makam.co.id yang menghubungkan kita.",
  berkas_tidak_didukung: "Foto tidak bisa dibaca. Pakai JPG, PNG atau WebP di bawah 12 MB.",
  penyimpanan_belum_tersedia: "Foto belum bisa disimpan sekarang. Coba lagi sebentar lagi.",
  tidak_ditemukan: "Percakapan tidak ditemukan.",
  bukan_pemesan: "Percakapan ini bukan milik Akun Anda.",
  tidak_berwenang: "Anda tidak punya akses ke percakapan ini.",
  perlu_totp: "Masukkan kode keamanan Anda dulu.",
  belum_masuk: "Masuk dulu untuk membalas.",
};
