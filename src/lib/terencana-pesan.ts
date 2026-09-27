import type { PilihanDitolak, PlaceTerencanaResult } from "@/domain/pemesanan";
import { QRIS_PAYMENT_CAP } from "@/domain/billing";
import { formatRupiah } from "@/lib/rupiah";
import { identityMessage, type IdentityRefusal } from "@/components/kode-masuk/state";

/**
 * Bahasa Indonesia for every way a chosen selection can be refused, so the
 * wizard's screens never show a reason key, and the refusal at "Lanjut" reads the
 * same as the one at Kirim (spec, Booking wizards: a Petak taken meanwhile is caught
 * both at Lanjut and at Kirim with the same friendly message). Copy rules
 * (docs/design-system.md): say what happened, its limit and the next step, in
 * `CONTEXT.md` words, with no internal ticket number. The guard's own reasons (a
 * session, a role) are identity's own words.
 */

/** What the order refuses, and what the picker's check refuses, in one shape. */
type Ditolak = Extract<PlaceTerencanaResult, { ok: false }> | PilihanDitolak;

/** The words for a refusal, naming the plot and what to do next. */
export function pesanKirim(hasil: Ditolak): string {
  switch (hasil.reason) {
    case "sudah_dipesan":
      return `Maaf, ${nomor(hasil)} baru saja dipesan keluarga lain. Pilihan petak Anda yang lain tetap tersimpan.`;
    case "unit_tidak_bisa_dipilih":
      return `${statusSentence(nomor(hasil), status(hasil))} Pilih petak lain di denah.`;
    case "unit_campur":
      return "Kavling Keluarga dipilih utuh sebagai satu unit, jadi tidak bisa digabung dengan petak lain. Pilih kavling saja atau petak saja.";
    case "unit_ganda":
      return `${nomor(hasil)} tercatat dua kali dalam pilihan Anda. Pilih ulang petaknya.`;
    case "tanpa_unit":
      return "Belum ada petak yang dipilih. Ketuk petak yang Tersedia di denah.";
    case "melebihi_batas_qris":
      return pesanBatasPembayaran(hasil.total);
    case "unit_tidak_ditemukan":
      return "Petak yang Anda pilih tidak ada lagi di denah ini. Kembali ke denah untuk memilih ulang.";
    case "lokasi_tidak_ada":
      return "Lokasi ini sedang tidak menerima pemesanan terencana. Pilih lokasi lain.";
    case "harga_tidak_tersedia":
      return "Harga petak ini belum tersedia. Pilih petak lain atau hubungi CS kami.";
    case "telepon_pemegang_hak_tidak_valid":
      return "Nomor telepon Pemegang Hak tidak valid. Contoh: 0812 3456 7890.";
    case "akun_tidak_cocok":
      return "Email ini bukan email akun yang sedang masuk. Masuk ulang dengan email yang sama.";
    case "telepon_tidak_valid":
      return "Nomor telepon tidak valid. Contoh: 0812 3456 7890.";
    default:
      return "Periksa lagi pilihan petak Anda.";
  }
}

/**
 * The words for a refused selection at "Lanjut", the same refusal the order would
 * give: the plot that went, the limit, and that the other picks are kept.
 */
export function pesanPeriksa(hasil: PilihanDitolak): string {
  return pesanKirim(hasil);
}

/**
 * The picker's own refusal for a selection above the payment cap, the same words Kirim
 * gives, so a family reads one thing about one limit.
 */
export function pesanBatasPembayaran(total: number): string {
  return `Total pilihan ini ${formatRupiah(total)} melewati batas pembayaran ${formatRupiah(QRIS_PAYMENT_CAP)} lewat QRIS. Kurangi jumlah petak yang dipilih.`;
}

/** The words for a guard refusal, in identity's own voice. */
export function pesanGuard(reason: IdentityRefusal): string {
  return identityMessage(reason);
}

function nomor(hasil: Ditolak): string {
  return ("nomor" in hasil ? (hasil.nomor ?? "") : "") || "Petak itu";
}

function status(hasil: Ditolak): string {
  return "status" in hasil ? (hasil.status ?? "tidak_tersedia") : "tidak_tersedia";
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

