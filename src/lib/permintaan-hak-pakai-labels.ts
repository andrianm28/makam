/**
 * The words of a Pengembalian Hak Pakai / Ganti Pemegang Hak request, for the family's and the Admin Lokasi's screens
 * (spec, Pemesanan > Requests from the Pemegang Hak; ticket 39). Reason codes are the Pemesanan module's own.
 */
import type { StatusKey } from "@/components/makam/status-badge";
import type { PermintaanHakPakaiJenis, PermintaanHakPakaiStatus } from "@/domain/pemesanan";

export const statusPermintaanHakPakaiBadge: Record<PermintaanHakPakaiStatus, StatusKey> = {
  diajukan: "diajukan",
  perlu_perbaikan: "perlu_perbaikan",
  disetujui: "disetujui",
  ditolak: "ditolak",
  dibatalkan: "dibatalkan",
};

export function namaPermintaanHakPakai(jenis: PermintaanHakPakaiJenis): string {
  return jenis === "pengembalian" ? "Pengembalian Hak Pakai" : "Ganti Pemegang Hak";
}

/** What each status means and what happens next, in the family's words. */
export function artiStatusPermintaanHakPakai(jenis: PermintaanHakPakaiJenis, status: PermintaanHakPakaiStatus): string {
  const ganti = jenis === "ganti_pemegang_hak";
  switch (status) {
    case "diajukan":
      return "Menunggu Lokasi Mitra. Lokasi Mitra menjawab dalam 2 hari kerja, dan jawabannya datang ke email Anda.";
    case "perlu_perbaikan":
      return "Lokasi Mitra meminta permintaan ini diperbaiki sebelum bisa diputuskan. Baca catatannya, lalu ajukan kembali.";
    case "disetujui":
      return ganti
        ? "Ganti Pemegang Hak disetujui. Hak Pakai ini sekarang pindah ke Pemegang Hak yang baru; riwayat pemegang sebelumnya tetap tercatat."
        : "Pengembalian disetujui. Hak Pakai berakhir dan petaknya kembali ke Lokasi Mitra.";
    case "ditolak":
      return "Lokasi Mitra tidak menyetujui permintaan ini. Hak Pakai Anda tetap seperti semula.";
    case "dibatalkan":
      return "Anda menarik permintaan ini sebelum diputuskan. Hak Pakai tidak berubah, dan Anda boleh mengajukan lagi.";
  }
}

/** Why a step was refused, saying what to do next (the family's and the Admin Lokasi's screens share it). */
export function permintaanHakPakaiText(reason: string): string {
  switch (reason) {
    case "belum_masuk":
      return "Silakan masuk lagi untuk melanjutkan.";
    case "tidak_berwenang":
      return "Anda tidak berwenang untuk tindakan ini.";
    case "tidak_ditemukan":
      return "Permintaan atau Hak Pakai ini tidak ditemukan.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda: nama dan nomor telepon wajib diisi dan nomornya harus nomor Indonesia yang benar; catatan paling banyak 500 huruf.";
    case "hak_pakai_sudah_berakhir":
      return "Hak Pakai ini sudah berakhir, jadi tidak ada yang bisa diubah.";
    case "sudah_ada_pemakaman":
      return "Sudah ada pemakaman di petak ini, jadi petak tidak bisa dikembalikan. Untuk mengganti Pemegang Hak, ajukan Ganti Pemegang Hak.";
    case "sudah_ada_permintaan":
      return "Sudah ada permintaan untuk Hak Pakai ini yang belum diputuskan.";
    case "tagihan_lewat_jatuh_tempo":
      return "Ada Tagihan Saat Duka untuk Hak Pakai ini yang Lewat Jatuh Tempo. Lunasi dulu sebelum mengganti Pemegang Hak.";
    case "pembatalan_terbuka":
      return "Ada permintaan Pembatalan untuk Hak Pakai ini yang belum diputuskan. Selesaikan atau tarik dulu.";
    case "jual_tidak_diizinkan":
      return "Lokasi Mitra ini tidak mengizinkan pengalihan Hak Pakai lewat jual-beli. Pewarisan tetap diizinkan.";
    case "berkas_tidak_didukung":
      return "Berkas harus berupa JPEG, PNG atau PDF yang tidak kosong, paling besar 10 MB.";
    case "ktp_wajib":
      return "Unggah hasil pemeriksaan KTP (JPEG, PNG atau PDF) sebelum mengubah kontak.";
    case "penyimpanan_belum_tersedia":
      return "Penyimpanan berkas sedang tidak tersedia. Coba lagi sebentar lagi.";
    case "status_tidak_sesuai":
    case "sudah_diputuskan":
      return "Permintaan ini sudah diputuskan atau ditarik; halaman sudah diperbarui.";
    case "petak_tidak_dikenal":
      return "Petak ini bukan bagian dari Hak Pakai Anda.";
    default:
      return "Permintaan tidak bisa diproses. Coba lagi atau hubungi Lokasi Mitra.";
  }
}
