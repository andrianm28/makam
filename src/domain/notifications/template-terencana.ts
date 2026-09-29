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

export type PembatalanTerencanaEmailInput =
  | {
      peristiwa: "disetujui";
      /** The Pemesan who paid owes the bank account; the Pemegang Hak who asked is only told where the money goes. */
      kepada: "pemesan" | "pemohon";
      nomor: string;
      lokasiName: string;
      unit: UnitTerencanaEmail[];
      persenRefund: number;
      jumlahRefund: number;
      /** Which side of the Masa Pembatalan the request was made on: the whole tariff, or the Lokasi Mitra's set share. */
      dalamMasaPembatalan: boolean;
      /** The order page's full URL, where the Pemesan enters the bank account. */
      tautan: string;
    }
  | { peristiwa: "ditolak"; nomor: string; lokasiName: string; unit: UnitTerencanaEmail[]; alasan: string; tautan: string }
  | { peristiwa: "perlu_perbaikan"; nomor: string; lokasiName: string; unit: UnitTerencanaEmail[]; catatan: string; tautan: string };

/**
 * The Admin Lokasi's answer to a Pembatalan request (transactional: any hour, the family is waiting
 * for it). An approval says what comes back and what does not (the Biaya Layanan Platform never
 * does) and, to the Pemesan who paid, asks for the bank account the refund goes to.
 */
export function pembatalanTerencanaEmail(input: PembatalanTerencanaEmailInput): { subject: string; body: string } {
  const petak = daftarUnit(input.unit);
  if (input.peristiwa === "ditolak") {
    return {
      subject: `Pembatalan pesanan ${input.nomor} tidak disetujui`,
      body: [
        "Yth. Bapak/Ibu,",
        "",
        `${input.lokasiName} tidak menyetujui Pembatalan Hak Pakai atas petak ${petak}.`,
        `Alasannya: ${input.alasan}.`,
        "Hak Pakai Anda tetap berlaku seperti semula dan tidak ada yang berubah pada pembayaran.",
        "",
        `Lihat Makam Keluarga Anda di: ${input.tautan}`,
        "",
        "Hormat kami,",
        "Tim makam.co.id",
      ].join("\n"),
    };
  }
  if (input.peristiwa === "perlu_perbaikan") {
    return {
      subject: `Pembatalan pesanan ${input.nomor} perlu diperbaiki`,
      body: [
        "Yth. Bapak/Ibu,",
        "",
        `${input.lokasiName} meminta permintaan Pembatalan atas petak ${petak} diperbaiki sebelum bisa diputuskan.`,
        `Yang diminta: ${input.catatan}.`,
        "Setelah diperbaiki, ajukan kembali dari Makam Keluarga Anda. Besar pengembalian dana tidak berubah karena penantian ini.",
        "",
        `Ajukan kembali di: ${input.tautan}`,
        "",
        "Hormat kami,",
        "Tim makam.co.id",
      ].join("\n"),
    };
  }
  const bagian = input.dalamMasaPembatalan
    ? "seluruh tarif Hak Pakai (masih dalam Masa Pembatalan)"
    : `${input.persenRefund}% dari tarif Hak Pakai (sesuai Syarat yang Anda setujui saat memesan)`;
  const dana =
    input.jumlahRefund > 0
      ? `Pengembalian dana: ${formatRupiah(input.jumlahRefund)}, yaitu ${bagian}. Biaya Layanan Platform tidak dikembalikan.`
      : `Menurut Syarat yang Anda setujui saat memesan, tidak ada pengembalian dana untuk Pembatalan setelah Masa Pembatalan berakhir (${input.persenRefund}% dari tarif).`;
  const tujuan =
    input.jumlahRefund === 0
      ? []
      : input.kepada === "pemesan"
        ? [
            "Dana dikembalikan kepada Pemesan yang membayar. Mohon isi rekening tujuan pengembalian di halaman pesanan; Admin kami menyetujui dan mentransfernya setelah itu.",
            `Isi rekening di: ${input.tautan}`,
          ]
        : ["Dana dikembalikan kepada Pemesan yang membayar pesanan ini, ke rekening yang ia isi sendiri."];
  return {
    subject: `Pembatalan pesanan ${input.nomor} disetujui`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `${input.lokasiName} menyetujui Pembatalan Hak Pakai atas petak ${petak}. Hak Pakai dibatalkan dan petak kembali ke Lokasi Mitra.`,
      dana,
      ...tujuan,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}
