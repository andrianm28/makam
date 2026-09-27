/**
 * The family email templates (ticket 20), in one place: a Pemesanan Makam
 * submitted and confirmed (ticket 23), a Tagihan issued and its pay-first
 * reminders, and a Bukti Pembayaran issued. Every email carries a link into
 * the app (the order or Tagihan page, which leads to its Bukti once Lunas);
 * the Operator pays every message and there are no marketing messages.
 * Terencana, Paket and pay-after reminders arrive with tickets 37, 54 and 29.
 */
import { formatRupiah } from "@/lib/rupiah";
import { formatTanggal, formatTanggalJam } from "@/lib/time/jakarta";

export interface PesananDiajukanEmailInput {
  nomor: string;
  lokasiName: string;
  jenisMakamName: string | null;
  almarhumName: string;
  tanggalWafat: string;
  rencanaPemakamanAt: Date | null;
  /** The instant the Lokasi's Jam Operasional promised a confirmation by; null while it had none. */
  konfirmasiDueAt: Date | null;
  /** The order page's full URL, into the app. */
  tautan: string;
}

/** A Pemesanan Makam submitted (transactional: any hour). Nothing is billed yet, so it says so. */
export function pesananDiajukanEmail(input: PesananDiajukanEmailInput): { subject: string; body: string } {
  const pemakaman = input.rencanaPemakamanAt
    ? `Rencana pemakaman: ${formatTanggalJam(input.rencanaPemakamanAt)}.`
    : "Rencana pemakaman belum ada; Lokasi Mitra yang menentukan hari.";
  const tenggat = input.konfirmasiDueAt
    ? `Lokasi Mitra mengonfirmasi paling lambat ${formatTanggalJam(input.konfirmasiDueAt)}.`
    : `${input.lokasiName} belum punya jam operasional, jadi belum ada janji konfirmasi.`;
  return {
    subject: `Pesanan ${input.nomor} diterima, ${input.lokasiName} mengonfirmasi`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Terima kasih, pesan saat duka untuk ${input.almarhumName} (wafat ${formatTanggal(input.tanggalWafat)}) sudah kami terima.`,
      `Lokasi Mitra: ${input.lokasiName}${input.jenisMakamName ? `, ${input.jenisMakamName}` : ""}.`,
      pemakaman,
      tenggat,
      "Belum ada yang dibayar. Tagihan terbit setelah Lokasi Mitra mengonfirmasi, dan dokumen boleh menyusul.",
      "",
      `Ikuti pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface PesananDikonfirmasiEmailInput {
  nomor: string;
  lokasiName: string;
  jenisMakamName: string | null;
  almarhumName: string;
  pemakamanAt: Date;
  /** The Petak Makam assigned to this order; null while the Lokasi has none to give (a Kavling Keluarga, ticket 36). */
  petakNomor: string | null;
  /** The Admin Lokasi to call, by name; the phone number is a contact, never verified. */
  kontakLokasi: { name: string; phoneNumber: string | null };
  /** The Lokasi Mitra's document checklist, as the family should bring it. */
  dokumen: string[];
  /** The pay-after Tagihan issued with the confirmation. */
  tagihan: { nomorTagihan: string; total: number; dueAt: Date; tautan: string };
  tautan: string;
}

/** A Pemesanan Makam confirmed (transactional: any hour): the plot, the contact, the documents and the payment deadline. */
export function pesananDikonfirmasiEmail(input: PesananDikonfirmasiEmailInput): { subject: string; body: string } {
  const petak = input.petakNomor
    ? `Petak Makam: ${input.petakNomor}.`
    : "Petak Makam menyusul; hubungi Lokasi Mitra untuk jadwalnya.";
  const telepon = input.kontakLokasi.phoneNumber
    ? `${input.kontakLokasi.name}, ${input.kontakLokasi.phoneNumber}.`
    : `${input.kontakLokasi.name}.`;
  return {
    subject: `Pesanan ${input.nomor} dikonfirmasi: ${input.petakNomor ?? "petak menyusul"} di ${input.lokasiName}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pesanan saat duka untuk ${input.almarhumName} sudah dikonfirmasi ${input.lokasiName}.`,
      petak,
      `Pemakaman: ${formatTanggalJam(input.pemakamanAt)}.`,
      `Jika ada yang perlu ditanyakan, hubungi Lokasi Mitra: ${telepon}`,
      `Dokumen yang sebaiknya dibawa: ${input.dokumen.length > 0 ? input.dokumen.join(", ") : "belum ada daftar"}.`,
      `Tagihan ${input.tagihan.nomorTagihan} sebesar ${formatRupiah(input.tagihan.total)} jatuh tempo ${formatTanggalJam(input.tagihan.dueAt)}.`,
      "Pemakaman tetap berjalan walaupun pembayaran belum masuk. Dokumen boleh menyusul setelah pemakaman.",
      "",
      `Tagihan: ${input.tagihan.tautan}`,
      `Ikuti pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface PesananBuktiPemesananEmailInput {
  nomor: string;
  lokasiName: string;
  /** The Bukti Pemesanan's own number, and the page's URL into the app. */
  bukti: { nomor: string; tautan: string };
  petakNomor: string;
  pemegangHakName: string;
  /** The Hak Pakai's term: the first Pemakaman's date, and the end of a fixed term (null for a Selamanya one). */
  masa: { mulai: string; selesai: string | null };
  tautan: string;
}

/**
 * The Bukti Pemesanan of a paid order (transactional: any hour — the family is
 * owed its proof the moment the money settles, not in the morning). It names the
 * right it proves and carries no amounts: the payment has its own Bukti.
 */
export function pesananBuktiPemesananEmail(input: PesananBuktiPemesananEmailInput): { subject: string; body: string } {
  const masa = input.masa.selesai ? `${formatTanggal(input.masa.mulai)} sampai ${formatTanggal(input.masa.selesai)}` : `mulai ${formatTanggal(input.masa.mulai)}, selamanya`;
  return {
    subject: `Bukti Pemesanan ${input.bukti.nomor}: hak atas Petak Makam ${input.petakNomor} di ${input.lokasiName}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pembayaran Pesanan ${input.nomor} sudah kami terima, dan hak makamnya sudah resmi.`,
      `Bukti Pemesanan: ${input.bukti.nomor}.`,
      `Lokasi: ${input.lokasiName}.`,
      `Petak Makam: ${input.petakNomor}.`,
      `Pemegang Hak: ${input.pemegangHakName}.`,
      `Masa Hak Pakai: ${masa}.`,
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
