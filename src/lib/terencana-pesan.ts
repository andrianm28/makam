import type { PlaceTerencanaResult } from "@/domain/pemesanan";
import { identityMessage, type IdentityRefusal } from "@/components/kode-masuk/state";

/**
 * Bahasa Indonesia for every reason the Pemesanan module can refuse a Terencana
 * order, so the wizard's screens never show a reason key. Copy rules
 * (docs/design-system.md): say what happened, its limit and the next step, in
 * `CONTEXT.md` words, with no internal ticket number. The guard's own reasons
 * (a session, a role) are identity's own words (`identityMessage`).
 */

type Refusal = Exclude<PlaceTerencanaResult, { ok: true }>;

/** The words for a refusal, naming the plot and what to do next. */
export function pesanKirim(hasil: Refusal): string {
  switch (hasil.reason) {
    case "sudah_dipesan":
      return `Maaf, ${hasil.nomor} baru saja dipesan keluarga lain. Kembali ke denah, pilihan petak lain masih tersimpan.`;
    case "unit_tidak_bisa_dipilih":
      return `${statusSentence(hasil.nomor, hasil.status)} Pilih petak lain di denah.`;
    case "melebihi_batas_qris":
      return `Total pilihan ini ${new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(hasil.total)}, melebihi batas pembayaran Rp 10.000.000 lewat QRIS. Kurangi jumlah petak yang dipilih.`;
    case "lokasi_tidak_ada":
      return "Lokasi ini sedang tidak menerima pemesanan terencana. Pilih lokasi lain.";
    case "unit_tidak_ditemukan":
      return "Petak yang Anda pilih tidak ada lagi di denah ini. Kembali ke denah untuk memilih ulang.";
    case "harga_tidak_tersedia":
      return "Harga petak ini belum tersedia. Pilih petak lain atau hubungi CS kami.";
    case "telepon_pemegang_hak_tidak_valid":
      return "Nomor telepon Pemegang Hak tidak valid. Contoh: 0812 3456 7890.";
    case "akun_tidak_cocok":
      return "Email ini bukan email akun yang sedang masuk. Masuk ulang dengan email yang sama.";
    default:
      return "Periksa lagi isian Anda.";
  }
}

/** The words for a guard refusal, in identity's own voice. */
export function pesanGuard(reason: IdentityRefusal): string {
  return identityMessage(reason);
}

function statusSentence(nomor: string, status: string): string {
  switch (status) {
    case "sedang_dipesan":
      return `Maaf, ${nomor} baru saja dipesan keluarga lain.`;
    case "terisi":
      return `${nomor} sudah terisi, jadi tidak bisa dipilih.`;
    case "tidak_tersedia":
      return `${nomor} sedang tidak dijual oleh lokasi, jadi tidak bisa dipilih.`;
    case "perlu_verifikasi":
      return `${nomor} belum dikonfirmasi oleh lokasi, jadi belum bisa dipilih.`;
    case "masa_berlaku_habis":
      return `Masa Hak Pakai ${nomor} sudah habis, jadi tidak bisa dipilih.`;
    default:
      return `${nomor} tidak bisa dipilih lagi.`;
  }
}
