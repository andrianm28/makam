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

export interface PesananDitolakEmailInput {
  nomor: string;
  lokasiName: string;
  almarhumName: string;
  /** The reason off the closed list, already in the wording that list gives it. */
  alasan: string;
  /** The order page's full URL, which is also where the rebook link leads from. */
  tautan: string;
  /** The Pilih makam list again, with the rejecting Lokasi taken out and the family's data carried over. */
  tautanPemesanUlang: string;
}

/**
 * A Pemesanan Makam declined (transactional: any hour): the reason in the Lokasi's
 * own words, the promise that somebody will phone, and the link back to the list
 * of other options (ADR 0004: the link goes by email, never WhatsApp).
 */
export function pesananDitolakEmail(input: PesananDitolakEmailInput): { subject: string; body: string } {
  return {
    subject: `Pesanan ${input.nomor} belum bisa dilayani ${input.lokasiName}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Dengan sangat menyedihkan, ${input.lokasiName} belum bisa melayani pesanan saat duka untuk ${input.almarhumName}.`,
      `Alasannya: ${input.alasan}.`,
      "Pesanan ini kami tandai ditolak dan tidak ada yang perlu dibayar. Tim kami akan menghubungi Anda untuk mencarikan pilihan lain.",
      "",
      `Pilih makam lain di: ${input.tautanPemesanUlang}`,
      `Data Anda sudah terisi, jadi tinggal pilih makamnya. ${input.lokasiName} tidak lagi muncul di daftar itu.`,
      "",
      `Detail pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface PesananAlternatifEmailInput {
  nomor: string;
  lokasiName: string;
  almarhumName: string;
  /** What was ordered; either half may be null, never both. */
  dariJenisMakamName: string | null;
  dariPemakamanAt: Date | null;
  /** What is offered instead. */
  keJenisMakamName: string | null;
  kePemakamanAt: Date | null;
  /** The all-in total the alternative carries, so one tap decides on the real number. */
  total: number;
  lines: { label: string; amount: number }[];
  /** The order page, where the two buttons are. */
  tautan: string;
}

/** An alternative offered: the new all-in total, its lines, and the two answers, in one tap each. */
export function pesananAlternatifEmail(input: PesananAlternatifEmailInput): { subject: string; body: string } {
  const dari = [
    input.dariJenisMakamName ? input.dariJenisMakamName : "jenis makam yang sama",
    input.dariPemakamanAt ? formatTanggalJam(input.dariPemakamanAt) : "tanggal yang sama",
  ].join(", ");
  const ke = [
    input.keJenisMakamName ? input.keJenisMakamName : "jenis makam yang sama",
    input.kePemakamanAt ? formatTanggalJam(input.kePemakamanAt) : "tanggal yang sama",
  ].join(", ");
  return {
    subject: `Pilihan lain untuk pesanan ${input.nomor} di ${input.lokasiName}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `${input.lokasiName} punya pilihan lain untuk pemakaman ${input.almarhumName}.`,
      `Dulu: ${dari}.`,
      `Sekarang bisa: ${ke}.`,
      `Total semua biaya: ${formatRupiah(input.total)}.`,
      ...input.lines.map((line) => `- ${line.label}: ${formatRupiah(line.amount)}`),
      "",
      "Terima atau tolak pilihan ini di halaman pesanan. Kalau ditolak, pesanan ini menjadi ditolak dan tim kami menghubungi Anda.",
      `Halaman pesanan: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface PesananDibatalkanEmailInput {
  nomor: string;
  lokasiName: string;
  almarhumName: string;
  /** True when the Admin Lokasi recorded the cancellation for the family. */
  olehLokasi: boolean;
  /** The Petak Makam that went back to the Lokasi Mitra's list, when the order had one. */
  petakNomor: string | null;
  /** The Tagihan cancelled with the order, and the money on its way back (the Biaya Layanan Platform is never refunded). */
  tagihan: { nomorTagihan: string; jumlahDikembalikan: number } | null;
  tautan: string;
}

/** A cancelled order: what was given back, and that nothing is owed. */
export function pesananDibatalkanEmail(input: PesananDibatalkanEmailInput): { subject: string; body: string } {
  const petak = input.petakNomor ? `Petak Makam ${input.petakNomor} dikembalikan ke ${input.lokasiName}.` : null;
  const uang = input.tagihan
    ? input.tagihan.jumlahDikembalikan > 0
      ? `Tagihan ${input.tagihan.nomorTagihan} dibatalkan. Uang yang sudah masuk ${formatRupiah(input.tagihan.jumlahDikembalikan)} sedang dikembalikan; Biaya Layanan Platform tidak dikembalikan.`
      : `Tagihan ${input.tagihan.nomorTagihan} dibatalkan dan belum ada uang yang masuk.`
    : "Belum ada Tagihan, jadi tidak ada yang perlu dibayar.";
  return {
    subject: `Pesanan ${input.nomor} dibatalkan`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pesanan saat duka untuk ${input.almarhumName} di ${input.lokasiName} sudah dibatalkan${
        input.olehLokasi ? " atas permintaan keluarga, dicatat oleh Lokasi Mitra" : ""
      }.`,
      petak,
      uang,
      "Tidak ada biaya pembatalan.",
      "",
      `Detail pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ]
      .filter((baris): baris is string => baris !== null)
      .join("\n"),
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

export interface BuktiPengembalianEmailInput {
  nomorBukti: string;
  nomorTagihan: string;
  /** Whole rupiah that went back to the Pemesan. */
  jumlah: number;
  /** The date Admin Platform entered for the transfer (WIB "YYYY-MM-DD"). */
  ditransferPada: string;
  /** Whether the Biaya Layanan Platform came back with it, which the spec says the Bukti states. */
  biayaLayananPlatformDikembalikan: boolean;
  /** The Bukti Pengembalian Dana page's full URL. */
  tautan: string;
}

/**
 * A Bukti Pengembalian Dana issued (transactional: any hour — a family waiting on
 * its own money hears about it at once, and the message asks nothing of it).
 * Whether the Operator's fee came back is stated here as well as on the Bukti,
 * because a family told only an amount would have to guess what the difference was.
 */
export function buktiPengembalianEmail(input: BuktiPengembalianEmailInput): { subject: string; body: string } {
  return {
    subject: `Pengembalian dana ${input.nomorBukti} – Tagihan ${input.nomorTagihan}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pengembalian dana sebesar ${formatRupiah(input.jumlah)} untuk Tagihan ${input.nomorTagihan} telah kami transfer pada ${input.ditransferPada}.`,
      input.biayaLayananPlatformDikembalikan
        ? "Biaya Layanan Platform ikut dikembalikan."
        : "Biaya Layanan Platform tidak dikembalikan.",
      "",
      `Unduh Bukti Pengembalian Dana ${input.nomorBukti} di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}
