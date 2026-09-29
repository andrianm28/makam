/**
 * The words of a Pembatalan of a paid Pemesanan Terencana, for the family's and the Admin Lokasi's screens (spec,
 * Pemesanan > Requests from the Pemegang Hak; ticket 38). The reason codes are the Pemesanan module's own, and
 * each switch is exhaustive over them: a reason the module adds fails the typecheck here.
 */
import type { PermintaanPembatalanStatus, SebabPembatalanTerhalang, SetujuiPembatalanResult } from "@/domain/pemesanan";
import type { StatusKey } from "@/components/makam/status-badge";

/** A request status as the status vocabulary keys it. */
export const statusPermintaanBadge: Record<PermintaanPembatalanStatus, StatusKey> = {
  diajukan: "diajukan",
  perlu_perbaikan: "perlu_perbaikan",
  disetujui: "disetujui",
  ditolak: "ditolak",
  dibatalkan: "dibatalkan",
};

/** What each status means and what happens next, in the family's words. */
export function artiStatusPermintaan(status: PermintaanPembatalanStatus): string {
  switch (status) {
    case "diajukan":
      return "Menunggu Lokasi Mitra memastikan belum ada pemakaman di petak ini. Lokasi Mitra menjawab dalam 2 hari kerja, dan jawabannya datang ke email Anda.";
    case "perlu_perbaikan":
      return "Lokasi Mitra meminta permintaan ini diperbaiki sebelum bisa diputuskan. Perbaiki lalu ajukan kembali; besar pengembalian dana tidak berubah.";
    case "disetujui":
      return "Pembatalan disetujui: Hak Pakai petak ini dibatalkan dan petaknya kembali ke Lokasi Mitra.";
    case "ditolak":
      return "Lokasi Mitra tidak menyetujui Pembatalan ini. Hak Pakai Anda tetap berlaku seperti semula.";
    case "dibatalkan":
      return "Anda menarik permintaan ini sebelum diputuskan. Hak Pakai tidak berubah, dan Anda boleh mengajukan lagi.";
  }
}

/** Why "Ajukan Pembatalan" is not offered, in the family's words. */
export function sebabTerhalangText(sebab: SebabPembatalanTerhalang): string {
  switch (sebab) {
    case "pesanan_tidak_aktif":
      return "Pesanan ini sudah tidak aktif, jadi tidak ada Hak Pakai yang bisa dibatalkan.";
    case "hak_pakai_sudah_berakhir":
      return "Hak Pakai petak ini sudah berakhir, jadi tidak ada yang bisa dibatalkan.";
    case "sudah_ada_permintaan":
      return "Sudah ada permintaan Pembatalan untuk petak ini yang belum diputuskan.";
    case "sudah_ada_pemakaman":
      return "Sudah ada pemakaman di petak ini, jadi Pembatalan tidak bisa diajukan. Untuk mengembalikan petak yang tidak terpakai, bicarakan langsung dengan Lokasi Mitra.";
    case "pernah_ganti_pemegang_hak":
      return "Pemegang Hak petak ini pernah diganti, jadi Pembatalan tidak bisa diajukan. Hubungi Lokasi Mitra untuk membicarakannya.";
  }
}

type Refusal<R extends { ok: boolean }> = Extract<R, { ok: false; reason: string }>["reason"];

/** Why a Pembatalan step was refused to the Pemegang Hak, saying what to do next. */
export function pembatalanFamilyMessage(reason: string): string {
  switch (reason) {
    case "belum_masuk":
      return "Silakan masuk lagi untuk melanjutkan.";
    case "tidak_ditemukan":
      return "Permintaan atau Hak Pakai ini tidak ditemukan untuk Akun Anda.";
    case "input_tidak_valid":
      return "Periksa lagi isian Anda. Catatan paling banyak 500 huruf.";
    case "status_tidak_sesuai":
      return "Permintaan ini sudah berubah status, jadi langkah ini tidak bisa dilakukan lagi. Muat ulang halaman ini.";
    case "sudah_ada_permintaan":
    case "pesanan_tidak_aktif":
    case "hak_pakai_sudah_berakhir":
    case "sudah_ada_pemakaman":
    case "pernah_ganti_pemegang_hak":
      return sebabTerhalangText(reason);
    default:
      return "Permintaan ini belum bisa diproses. Periksa lagi sebentar.";
  }
}

/** Why an Admin Lokasi's answer to a Pembatalan was refused, saying what to do next. */
export function pembatalanStafMessage(reason: Refusal<SetujuiPembatalanResult>): string {
  switch (reason) {
    case "tidak_berwenang":
    case "perlu_totp":
      return "Anda tidak berwenang untuk pesanan ini.";
    case "input_tidak_valid":
      return "Isi alasan atau catatan terlebih dulu (paling banyak 500 huruf).";
    case "tidak_ditemukan":
      return "Permintaan Pembatalan ini tidak ditemukan.";
    case "sudah_diputuskan":
      return "Permintaan ini sudah dijawab atau ditarik keluarga, jadi tidak bisa dijawab lagi.";
    case "pesanan_tidak_aktif":
      return "Pesanan ini sudah tidak aktif, jadi tidak ada Hak Pakai yang bisa dibatalkan.";
    case "hak_pakai_sudah_berakhir":
      return "Hak Pakai petak ini sudah berakhir, jadi Pembatalan tidak bisa disetujui. Tolak permintaannya dengan alasan.";
    case "sudah_ada_pemakaman":
      return "Sudah ada Pemakaman di petak ini, jadi Pembatalan tidak bisa disetujui. Tolak permintaannya dengan alasan.";
    case "pernah_ganti_pemegang_hak":
      return "Pemegang Hak petak ini pernah diganti, jadi Pembatalan tidak bisa disetujui. Tolak permintaannya dengan alasan.";
    case "pengembalian_sebelumnya_menunggu_transfer":
      return "Ada pengembalian dana lain untuk Tagihan pesanan ini yang sudah disetujui dan menunggu transfer. Tunggu sampai pengembalian itu ditransfer Admin Platform, lalu setujui lagi; tidak ada yang berubah.";
    case "pengembalian_tidak_bisa_diajukan":
      return "Pengembalian dana belum bisa diajukan karena ada pengembalian lain untuk Tagihan ini yang sedang diproses. Hubungi Admin Platform; tidak ada yang berubah.";
  }
}
