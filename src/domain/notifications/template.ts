/**
 * The family email templates (ticket 20), in one place: a Tagihan issued and
 * its pay-first reminders, and a Bukti Pembayaran issued. Every email carries
 * a link into the app (the Tagihan page, which leads to its Bukti once
 * Lunas); the Operator pays every message and there are no marketing
 * messages. Terencana, Paket and pay-after reminders arrive with tickets 37,
 * 54 and 29.
 */
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggalJam } from "@/lib/time/jakarta";

export interface TagihanEmailInput {
  nomorTagihan: string;
  nomorPemesanan: string | null;
  perihal: string;
  total: number;
  dueAt: Date;
  /** The Tagihan page's full URL, into the app. */
  tautan: string;
}

function orderRef(input: Pick<TagihanEmailInput, "nomorPemesanan" | "perihal">): string {
  return input.nomorPemesanan ? `${input.perihal} (${input.nomorPemesanan})` : input.perihal;
}

/** A Tagihan issued (transactional: any hour). */
export function tagihanTerbitEmail(input: TagihanEmailInput): { subject: string; body: string } {
  return {
    subject: `Tagihan ${input.nomorTagihan} sebesar ${formatRupiah(input.total)} telah terbit`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Tagihan ${input.nomorTagihan} sebesar ${formatRupiah(input.total)} untuk ${orderRef(input)} telah terbit dan jatuh tempo pada ${formatTanggalJam(input.dueAt)}.`,
      "",
      `Lihat dan bayar Tagihan di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

/** A pay-first reminder: H-1 or the due day (only 08:00–20:00 WIB). */
export function tagihanPengingatEmail(
  macam: "h_1" | "hari_h",
  input: TagihanEmailInput,
): { subject: string; body: string } {
  const kapan = macam === "h_1" ? "besok" : "hari ini";
  return {
    subject: `Pengingat: Tagihan ${input.nomorTagihan} jatuh tempo ${kapan}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Tagihan ${input.nomorTagihan} sebesar ${formatRupiah(input.total)} untuk ${orderRef(input)} jatuh tempo ${kapan}, ${formatTanggalJam(input.dueAt)}.`,
      "",
      `Lihat dan bayar Tagihan di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface BuktiEmailInput {
  nomorBukti: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  total: number;
  paidAt: Date;
  /** The Tagihan page's full URL: it leads to the Bukti once the Tagihan is Lunas. */
  tautan: string;
}

/** A Bukti Pembayaran issued (transactional: any hour). */
export function buktiPembayaranEmail(input: BuktiEmailInput): { subject: string; body: string } {
  const ref = input.nomorPemesanan ? ` (${input.nomorPemesanan})` : "";
  return {
    subject: `Bukti Pembayaran ${input.nomorBukti} – Tagihan ${input.nomorTagihan} lunas`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pembayaran Tagihan ${input.nomorTagihan}${ref} sebesar ${formatRupiah(input.total)} telah kami terima pada ${formatTanggalJam(input.paidAt)}.`,
      "",
      `Unduh Bukti Pembayaran ${input.nomorBukti} di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}
