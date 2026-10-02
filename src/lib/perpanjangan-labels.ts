/**
 * The words of a Perpanjangan: the note that replaces the button when it cannot
 * be ordered, and the refusals a family can meet while ordering. Kept apart from
 * the page and the Server Actions so both say the same thing.
 */
import { formatTanggal } from "@/lib/time/jakarta";
import type { CatatanPerpanjangan } from "@/domain/perpanjangan";

/** The note that replaces the Perpanjangan button, in the words the spec gives it. */
export function catatanPerpanjanganText(catatan: CatatanPerpanjangan): string {
  switch (catatan.kind) {
    case "selamanya":
      return "Hak Pakai ini berlaku selamanya, jadi tidak perlu diperpanjang.";
    case "terlalu_awal":
      return `Hak Pakai ini bisa diperpanjang mulai ${formatTanggal(catatan.mulaiPada)}.`;
    case "lunasi_tagihan":
      return `Lunasi Tagihan ${catatan.nomorTagihan} terlebih dahulu.`;
    case "hubungi_admin_lokasi":
      switch (catatan.sebab) {
        case "berakhir":
          return "Hak Pakai ini sudah berakhir. Silakan hubungi Admin Lokasi.";
        case "dibatalkan":
          return "Hak Pakai ini sudah dibatalkan. Silakan hubungi Admin Lokasi.";
        case "lewat_masa_tenggang":
          return "Masa tenggang Hak Pakai ini sudah lewat. Silakan hubungi Admin Lokasi.";
        case "perlu_verifikasi":
          return "Data Hak Pakai ini masih dilengkapi Admin Lokasi. Silakan hubungi Admin Lokasi.";
        default:
          return "Silakan hubungi Admin Lokasi untuk memperpanjang Hak Pakai ini.";
      }
  }
}

/** Every reason a Perpanjangan order or its code step is refused, in Bahasa Indonesia. */
export type AlasanPerpanjangan =
  | "input_tidak_valid"
  | "harga_tidak_tersedia"
  | "kontak_pemegang_hak_kosong"
  | "tagihan_tidak_terbit"
  | "tidak_boleh"
  | "bukan_pemegang_hak"
  | "terms_melebihi_batas"
  | "tagihan_terbuka"
  | "melebihi_batas_qris"
  | "layanan_tidak_tersedia"
  | "teks_kosong"
  | "target_kosong"
  | "lead_time_melewati"
  | "tanpa_email";

export function alasanPerpanjanganText(alasan: AlasanPerpanjangan): string {
  switch (alasan) {
    case "input_tidak_valid":
      return "Isian belum lengkap. Periksa lagi lalu coba kembali.";
    case "harga_tidak_tersedia":
    case "tagihan_tidak_terbit":
    case "melebihi_batas_qris":
      return "Perpanjangan ini belum bisa dipesan lewat situs. Silakan hubungi CS.";
    case "kontak_pemegang_hak_kosong":
      return "Data Pemegang Hak belum lengkap. Silakan hubungi Admin Lokasi.";
    case "tidak_boleh":
      return "Perpanjangan untuk Hak Pakai ini belum bisa dipesan.";
    case "bukan_pemegang_hak":
      return "Perpanjangan hanya bisa dipesan oleh Pemegang Hak, dengan email yang tercatat pada Hak Pakai ini.";
    case "terms_melebihi_batas":
      return "Jumlah masa yang dipilih melebihi batas Lokasi Mitra ini.";
    case "tagihan_terbuka":
      return "Perpanjangan ini sudah punya Tagihan yang belum dibayar. Bayar Tagihan itu, atau tunggu sampai batal dengan sendirinya.";
    case "layanan_tidak_tersedia":
      return "Layanan yang Anda tambahkan tidak tersedia di Lokasi Mitra ini. Hapus layanan itu lalu coba lagi.";
    case "teks_kosong":
      return "Isi tulisan yang diminta layanan yang Anda tambahkan.";
    case "target_kosong":
      return "Pilih tanggal pengerjaan untuk setiap layanan yang Anda tambahkan.";
    case "lead_time_melewati":
      return "Tanggal pengerjaan terlalu dekat: sebuah layanan butuh waktu persiapan setelah batas pembayaran Perpanjangan. Pilih tanggal yang lebih akhir.";
    case "tanpa_email":
      return "Hak Pakai ini tidak punya email tercatat. Silakan ajukan lewat jalur berkas: hubungi Admin Lokasi atau CS.";
  }
}
