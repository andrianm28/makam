/**
 * The family emails of a Pemesanan Terencana (ticket 37; spec, Notifications): its
 * confirmation with the payment hold, a decline, a payment hold that ran out, the
 * Bukti Pemesanan, and the one reminder before the hold ends. Kept beside
 * `./template.ts`, which holds every other family email.
 */
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";
import { buktiPemesananMasa } from "@/lib/billing-labels";
import type { TagihanEmailInput } from "./template";

/** One plot of a Pemesanan Terencana, as the family knows it. */
export interface UnitTerencanaEmail {
  nomor: string;
  jenisMakamName: string;
}

function daftarUnit(unit: readonly UnitTerencanaEmail[]): string {
  return unit.map((satu) => `${satu.nomor} (${satu.jenisMakamName})`).join(", ");
}

export interface TerencanaDikonfirmasiEmailInput {
  nomor: string;
  lokasiName: string;
  unit: UnitTerencanaEmail[];
  /** The living person the plots are prepared for. */
  calonName: string;
  /** When the hold on the plots ends: the instant the Tagihan is due. */
  tahanSampai: Date;
  kontakLokasi: { name: string; phoneNumber: string | null };
  /** The pay-first Tagihan issued with the confirmation. */
  tagihan: { nomorTagihan: string; total: number; dueAt: Date; tautan: string };
  tautan: string;
}

/**
 * A Pemesanan Terencana confirmed (transactional: any hour, and the one email the
 * family gets for it: the order and the Tagihan are both here). The plots are held
 * until the deadline, and paying by then is what makes them the family's.
 */
export function terencanaDikonfirmasiEmail(input: TerencanaDikonfirmasiEmailInput): { subject: string; body: string } {
  const telepon = input.kontakLokasi.phoneNumber ? `${input.kontakLokasi.name}, ${input.kontakLokasi.phoneNumber}.` : `${input.kontakLokasi.name}.`;
  return {
    subject: `Pesanan ${input.nomor} dikonfirmasi: bayar sebelum ${formatTanggalJam(input.tahanSampai)}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `${input.lokasiName} sudah mengonfirmasi pesanan makam untuk ${input.calonName}.`,
      `Petak yang ditahan untuk Anda: ${daftarUnit(input.unit)}.`,
      `Petak ditahan sampai ${formatTanggalJam(input.tahanSampai)}. Setelah itu petak dilepas dan pesanan dibatalkan.`,
      `Tagihan ${input.tagihan.nomorTagihan} sebesar ${formatRupiah(input.tagihan.total)} jatuh tempo ${formatTanggalJam(input.tagihan.dueAt)}. Begitu Tagihan dibayar, Hak Pakai atas petak resmi dan Bukti Pemesanan kami kirim.`,
      "Jika berubah pikiran sebelum membayar, Anda bisa membatalkan pesanan tanpa biaya.",
      `Jika ada yang perlu ditanyakan, hubungi Lokasi Mitra: ${telepon}`,
      "",
      `Lihat dan bayar Tagihan di: ${input.tagihan.tautan}`,
      `Ikuti pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface TerencanaDitolakEmailInput {
  nomor: string;
  lokasiName: string;
  unit: UnitTerencanaEmail[];
  /** The reason off the closed list, already in the wording that list gives it. */
  alasan: string;
  /** The order page's full URL. */
  tautan: string;
  /** The Terencana wizard's first step again, the Lokasi step. */
  tautanLokasiLain: string;
}

/** A Pemesanan Terencana declined (transactional: any hour): why, that nothing is owed, and the way back to the Lokasi step. */
export function terencanaDitolakEmail(input: TerencanaDitolakEmailInput): { subject: string; body: string } {
  return {
    subject: `Pesanan ${input.nomor} belum bisa dilayani ${input.lokasiName}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `${input.lokasiName} belum bisa melayani pesanan makam untuk petak ${daftarUnit(input.unit)}.`,
      `Alasannya: ${input.alasan}.`,
      "Petak yang tadi ditahan sudah dilepas dan tidak ada yang perlu dibayar.",
      "",
      `Pilih Lokasi Mitra lain di: ${input.tautanLokasiLain}`,
      "",
      `Detail pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface TerencanaBatasBayarLewatEmailInput {
  nomor: string;
  lokasiName: string;
  unit: UnitTerencanaEmail[];
  nomorTagihan: string;
  tautan: string;
  tautanLokasiLain: string;
}

/** A Pemesanan Terencana whose payment hold ran out (transactional): the plots are released and nothing was charged. */
export function terencanaBatasBayarLewatEmail(input: TerencanaBatasBayarLewatEmailInput): { subject: string; body: string } {
  return {
    subject: `Pesanan ${input.nomor} dibatalkan: batas pembayaran lewat`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Tagihan ${input.nomorTagihan} belum dibayar sampai batasnya, jadi pesanan makam di ${input.lokasiName} dibatalkan dan petak ${daftarUnit(input.unit)} dilepas.`,
      "Tidak ada yang ditagih. Jika Anda masih ingin menyiapkan makam, Anda bisa memesan lagi.",
      "",
      `Pesan lagi di: ${input.tautanLokasiLain}`,
      `Detail pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface TerencanaBuktiEmailInput {
  nomor: string;
  lokasiName: string;
  bukti: { nomor: string; tautan: string };
  /** The plots, as the Bukti Pemesanan names them. */
  petakNomor: string;
  pemegangHakName: string;
  /** The term of the right: not started, since nobody is buried in it yet. */
  masa: { mulai: string | null; selesai: string | null; tahun?: number | null };
  masaPembatalanBerakhirPada: Date;
  tautan: string;
}

/**
 * The Bukti Pemesanan of a paid Terencana order (transactional: any hour, the family
 * is owed its proof the moment the money settles). It names the right it proves and
 * carries no amounts, and says when the Masa Pembatalan ends.
 */
export function terencanaBuktiEmail(input: TerencanaBuktiEmailInput): { subject: string; body: string } {
  return {
    subject: `Bukti Pemesanan ${input.bukti.nomor}: hak atas ${input.petakNomor} di ${input.lokasiName}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pembayaran Pesanan ${input.nomor} sudah kami terima, dan hak makamnya sudah resmi.`,
      `Bukti Pemesanan: ${input.bukti.nomor}.`,
      `Lokasi: ${input.lokasiName}.`,
      `Petak Makam: ${input.petakNomor}.`,
      `Pemegang Hak: ${input.pemegangHakName}.`,
      `Masa Hak Pakai: ${buktiPemesananMasa(input.masa)}.`,
      `Masa Pembatalan berakhir ${formatTanggalJam(input.masaPembatalanBerakhirPada)}.`,
      "",
      "Simpan tautan ini. Di dalamnya ada Bukti Pemesanan lengkap yang bisa diunduh sebagai PDF.",
      `Bukti Pemesanan: ${input.bukti.tautan}`,
      `Ikuti pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

/**
 * The one reminder of a Pemesanan Terencana's payment hold, about 4 hours before it
 * ends (spec, Notifications' reminder table). It says the plots will be released,
 * which is what the family stands to lose.
 */
export function tagihanPengingatTahanEmail(input: TagihanEmailInput): { subject: string; body: string } {
  const untuk = input.nomorPemesanan ? `${input.perihal} (${input.nomorPemesanan})` : input.perihal;
  return {
    subject: `Pengingat: petak Anda ditahan sampai ${formatTanggalJam(input.dueAt)}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Tagihan ${input.nomorTagihan} sebesar ${formatRupiah(input.total)} untuk ${untuk} belum dibayar. Petak yang ditahan untuk Anda dilepas pada ${formatTanggalJam(input.dueAt)} jika Tagihan belum dibayar.`,
      "",
      `Lihat dan bayar Tagihan di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}
