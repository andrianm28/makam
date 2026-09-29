/**
 * The words of a manual Perpanjangan request (KTP, heir, claim): what a family
 * reads when a step is refused, what the Admin Lokasi reads when a decision is,
 * and the names of the three paths. Kept apart from the pages and the Server
 * Actions so both say the same thing. The reason codes are the Perpanjangan
 * module's own.
 */
import { catatanPerpanjanganText, alasanPerpanjanganText, type AlasanPerpanjangan } from "@/lib/perpanjangan-labels";
import type { CatatanPerpanjangan, JalurManual, StatusPermohonan } from "@/domain/perpanjangan";

export const jalurJudul: Record<JalurManual, string> = {
  ktp: "Unggah KTP",
  ahli_waris: "Ajukan sebagai ahli waris",
  klaim: "Klaim Hak Pakai",
};

export const jalurPenjelasan: Record<JalurManual, string> = {
  ktp: "Untuk Pemegang Hak yang emailnya tidak tercatat pada Hak Pakai ini, atau sudah tidak bisa dipakai. Admin Lokasi memeriksa KTP Anda, lalu mencatat email dan nomor telepon Anda pada Hak Pakai ini.",
  ahli_waris:
    "Untuk ahli waris Pemegang Hak yang sudah meninggal: satu permohonan untuk ganti Pemegang Hak sekaligus perpanjangan. Siapkan akta kematian, bukti ahli waris dan KTP Anda.",
  klaim: "Untuk kerabat Almarhum bila belum ada Pemegang Hak yang tercatat. Siapkan KTP, bukti hubungan keluarga dan kwitansi lama bila ada.",
};

export const statusPermohonanText: Record<StatusPermohonan, string> = {
  diajukan: "Diajukan. Admin Lokasi memeriksa berkas Anda.",
  perlu_perbaikan: "Perlu Perbaikan. Perbaiki berkas sesuai catatan Admin Lokasi, lalu ajukan lagi.",
  disetujui: "Disetujui. Pilih jumlah masa untuk membuat Tagihan.",
  ditolak: "Ditolak.",
  dibatalkan: "Dibatalkan.",
};

/** Why a step of the applicant's was refused, saying what to do next. `judulBerkas` names a document by its key. */
export function alasanPermohonanText(
  hasil: { reason: string; kunci?: string; catatan?: CatatanPerpanjangan; maxTerms?: number },
  judulBerkas: (kunci: string) => string = (kunci) => kunci,
): string {
  switch (hasil.reason) {
    case "permohonan_tidak_ditemukan":
    case "bukan_pemohon":
      return "Permohonan tidak ditemukan.";
    case "tidak_boleh":
      return hasil.catatan ? catatanPerpanjanganText(hasil.catatan) : alasanPerpanjanganText("tidak_boleh");
    case "jalur_tidak_sesuai":
      return "Jalur ini tidak cocok dengan data Hak Pakai. Klaim hanya untuk Hak Pakai tanpa Pemegang Hak tercatat; KTP dan ahli waris untuk yang sudah punya Pemegang Hak.";
    case "berkas_kurang":
      return `Berkas ${hasil.kunci ? judulBerkas(hasil.kunci) : "yang diminta"} belum diunggah.`;
    case "berkas_tidak_didukung":
      return `Berkas ${hasil.kunci ? judulBerkas(hasil.kunci) : ""} harus foto atau PDF, paling besar 3 MB.`.replace("  ", " ");
    case "penyimpanan_belum_tersedia":
      return "Berkas belum bisa disimpan sekarang. Coba lagi sebentar lagi.";
    case "nomor_telepon_tidak_valid":
      return "Nomor telepon tidak valid. Gunakan nomor seluler Indonesia.";
    case "permohonan_terbuka":
      return "Sudah ada permohonan untuk Hak Pakai ini yang sedang diperiksa.";
    case "sudah_disetujui":
      return "Sudah ada permohonan yang disetujui untuk Hak Pakai ini. Lanjutkan dari permohonan itu.";
    case "bukan_perlu_perbaikan":
      return "Permohonan ini tidak sedang meminta perbaikan.";
    case "sudah_diputuskan":
      return "Permohonan ini sudah diputuskan, jadi tidak bisa dibatalkan.";
    case "belum_disetujui":
      return "Permohonan ini belum disetujui Admin Lokasi.";
    case "persetujuan_kedaluwarsa":
      return "Persetujuan ini sudah lewat 30 hari. Silakan ajukan permohonan baru.";
    case "sudah_dipakai":
      return "Persetujuan ini sudah dipakai untuk Perpanjangan yang dibayar.";
    default:
      return alasanPerpanjanganText(hasil.reason as AlasanPerpanjangan);
  }
}

/** Why an Admin Lokasi's decision was refused, saying what to do next. */
export function keputusanPermohonanText(hasil: { reason: string; sebab?: string }): string {
  switch (hasil.reason) {
    case "permohonan_tidak_ditemukan":
      return "Permohonan tidak ditemukan.";
    case "tidak_berwenang":
      return "Anda tidak berwenang memutuskan permohonan ini.";
    case "tidak_dapat_diputuskan":
      return "Permohonan ini sudah tidak menunggu keputusan: sudah diputuskan, dikembalikan atau dibatalkan pemohon.";
    case "hak_pakai_tidak_ditemukan":
    case "hak_pakai_sudah_berakhir":
      return "Hak Pakai ini sudah tidak bisa diperpanjang.";
    case "tanggal_berakhir_wajib":
      return "Hak Pakai ini masih Perlu Verifikasi dan belum punya tanggal berakhir. Isi tanggal berakhir dari berkas yang ada.";
    case "pemegang_hak_gagal":
      return hasil.sebab === "nomor_telepon_tidak_valid" ? "Nomor telepon tidak valid. Perbaiki nomornya, lalu setujui lagi." : "Data Pemegang Hak belum bisa dicatat. Periksa lagi isiannya.";
    case "verifikasi_gagal":
      return "Data Hak Pakai belum bisa dilengkapi. Periksa tanggal berakhirnya.";
    default:
      return "Periksa lagi isian Anda. Alasan wajib diisi.";
  }
}
