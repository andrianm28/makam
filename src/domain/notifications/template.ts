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

export interface PengurusanDikonfirmasiEmailInput {
  nomor: string;
  tpu: { name: string; address: string };
  almarhum: { name: string; tanggalWafat: string };
  /** The burial agreed with the TPU, which the Tagihan's 3×24 h counts from. */
  pemakamanAt: Date;
  /** The Admin Platform who took the order, the person the family may write to. */
  adminPlatform: { name: string; phoneNumber: string | null };
  /** The TPU office's own contact, as Admin Platform arranged the burial through it. */
  kontakTpu: { name: string; phoneNumber: string };
  /** The one line Admin Platform added for this family; null while none. */
  catatan: string | null;
  /** Both document sets, as the order carries them. */
  dokumen: {
    pemakaman: { nama: string; catatan: string | null }[];
    pengajuan: { nama: string; catatan: string | null }[];
  };
  /** The price lines the Tagihan carries, named exactly as it names them. */
  harga: { kind: string; label: string; amount: number }[];
  /** The pay-after Tagihan issued with the confirmation. */
  tagihan: { nomorTagihan: string; total: number; dueAt: Date; tautan: string };
  /** The order page's full URL, into the app. */
  tautan: string;
}

export interface PesananBuktiPemesananEmailInput {
  nomor: string;
  lokasiName: string;
  /** The Bukti Pemesanan's own number, and the page's URL into the app. */
  bukti: { nomor: string; tautan: string };
  petakNomor: string;
  pemegangHakName: string;
  /** The Hak Pakai's term: the first Pemakaman's date (null while none is recorded), the end of a fixed term (null for a Selamanya one), and the term's length while it has not started. */
  masa: { mulai: string | null; selesai: string | null; tahun?: number | null };
  tautan: string;
}

/**
 * A Saat Duka TPU confirmation (transactional: any hour). The burial the family
 * agreed to, where it happens and whom to call about it, both document lists,
 * what it costs and that the burial does not wait for the payment.
 */
export function pengurusanDikonfirmasiEmail(input: PengurusanDikonfirmasiEmailInput): { subject: string; body: string } {
  const admin = input.adminPlatform.phoneNumber
    ? `${input.adminPlatform.name}, ${input.adminPlatform.phoneNumber}`
    : input.adminPlatform.name;
  const harga = input.harga.map((line) => `${line.label} ${formatRupiah(line.amount)}`).join(", ");
  const pemakaman = input.dokumen.pemakaman.map((satu) => satu.nama);
  const pengajuan = input.dokumen.pengajuan.map((satu) => satu.nama);
  return {
    subject: `Pengurusan ${input.nomor} dikonfirmasi: pemakaman di ${input.tpu.name}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pengurusan untuk ${input.almarhum.name} (wafat ${formatTanggal(input.almarhum.tanggalWafat)}) sudah kami konfirmasi`,
      `dengan ${input.tpu.name}, ${input.tpu.address}.`,
      `Pemakaman: ${formatTanggalJam(input.pemakamanAt)}.`,
      `Kantor TPU: ${input.kontakTpu.name}, ${input.kontakTpu.phoneNumber}.`,
      `Admin Platform yang menangani: ${admin}.`,
      ...(input.catatan ? [`Catatan: ${input.catatan}`] : []),
      "",
      `Dokumen dibawa saat pemakaman: ${pemakaman.length > 0 ? pemakaman.join(", ") : "belum ada daftar"}.`,
      `Dokumen diunggah setelah pemakaman: ${pengajuan.length > 0 ? pengajuan.join(", ") : "belum ada daftar"}.`,
      `Biaya: ${harga}.`,
      `Tagihan ${input.tagihan.nomorTagihan} sebesar ${formatRupiah(input.tagihan.total)} jatuh tempo ${formatTanggalJam(input.tagihan.dueAt)}.`,
      "Pemakaman tetap berjalan walaupun pembayaran belum masuk. Dokumen boleh menyusul setelah pemakaman.",
      "",
      `Tagihan: ${input.tagihan.tautan}`,
      `Ikuti pengurusan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

/**
 * The Bukti Pemesanan of a paid order (transactional: any hour — the family is
 * owed its proof the moment the money settles, not in the morning). It names the
 * right it proves and carries no amounts: the payment has its own Bukti.
 */
export function pesananBuktiPemesananEmail(input: PesananBuktiPemesananEmailInput): { subject: string; body: string } {
  const masa =
    input.masa.mulai === null
      ? input.masa.tahun
        ? `${input.masa.tahun} tahun sejak pemakaman pertama`
        : "selamanya, sejak pemakaman pertama"
      : input.masa.selesai
        ? `${formatTanggal(input.masa.mulai)} sampai ${formatTanggal(input.masa.selesai)}`
        : `mulai ${formatTanggal(input.masa.mulai)}, selamanya`;
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

export interface PengembalianTerbitEmailInput {
  nomorTagihan: string;
  nomorPemesanan: string | null;
  jumlah: number;
  biayaLayananPlatformDikembalikan: boolean;
  /** The Bukti Pengembalian Dana page's full URL. */
  tautan: string;
}

/** A Bukti Pengembalian Dana issued: the amount, and whether it is the full refundable amount (ticket 31). */
export function pengembalianTerbitEmail(input: PengembalianTerbitEmailInput): { subject: string; body: string } {
  const lines = [
    "Yth. Bapak/Ibu,",
    "",
    `Kami telah mentransfer pengembalian dana sebesar ${formatRupiah(input.jumlah)} untuk Tagihan ${input.nomorTagihan}` +
      (input.nomorPemesanan ? ` (pesanan ${input.nomorPemesanan})` : "") +
      ".",
  ];
  if (!input.biayaLayananPlatformDikembalikan) {
    lines.push("Biaya Layanan Platform pada Tagihan ini tidak termasuk dalam pengembalian.");
  }
  lines.push("", `Lihat Bukti Pengembalian Dana di: ${input.tautan}`, "", "Hormat kami,", "Tim makam.co.id");
  return {
    subject: `Pengembalian dana untuk Tagihan ${input.nomorTagihan} sebesar ${formatRupiah(input.jumlah)}`,
    body: lines.join("\n"),
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

/**
 * A pay-after Chasing reminder: H+3, H+7, H+14 or H+30 after the burial that
 * has already happened (spec, Billing > Chasing). It never repeats "jatuh
 * tempo besok"/"hari ini" (a pay-first reminder's words): the money is already
 * overdue, and the family is told how many days it has been.
 */
export function tagihanPengingatLewatJatuhTempoEmail(
  hari: 3 | 7 | 14 | 30,
  input: TagihanEmailInput,
): { subject: string; body: string } {
  return {
    subject: `Pengingat: Tagihan ${input.nomorTagihan} sudah lewat jatuh tempo ${hari} hari`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Tagihan ${input.nomorTagihan} sebesar ${formatRupiah(input.total)} untuk ${orderRef(input)} sudah lewat jatuh tempo ${hari} hari.`,
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

export interface BuktiPerpanjanganEmailInput {
  lokasiName: string;
  /** The Bukti Perpanjangan's own number, and its page's URL into the app. */
  bukti: { nomor: string; tautan: string };
  petakNomor: string;
  pemegangHakName: string;
  endDateLama: string;
  endDateBaru: string;
  terms: number;
}

/**
 * The Bukti Perpanjangan of a paid Perpanjangan (transactional: any hour, it asks
 * nothing). It names the right that was extended and both end dates; the payment
 * has its own Bukti Pembayaran.
 */
export function buktiPerpanjanganEmail(input: BuktiPerpanjanganEmailInput): { subject: string; body: string } {
  return {
    subject: `Bukti Perpanjangan ${input.bukti.nomor}: Petak Makam ${input.petakNomor} di ${input.lokasiName}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      "Pembayaran Perpanjangan Makam sudah kami terima, dan Hak Pakainya sudah diperpanjang.",
      `Bukti Perpanjangan: ${input.bukti.nomor}.`,
      `Lokasi: ${input.lokasiName}.`,
      `Petak Makam: ${input.petakNomor}.`,
      `Pemegang Hak: ${input.pemegangHakName}.`,
      `Masa berlaku sebelumnya sampai ${formatTanggal(input.endDateLama)}; sekarang sampai ${formatTanggal(input.endDateBaru)} (${input.terms} masa).`,
      "",
      "Simpan tautan ini. Di dalamnya ada Bukti Perpanjangan lengkap yang bisa diunduh sebagai PDF.",
      `Bukti Perpanjangan: ${input.bukti.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface LayananPesananTerbitEmailInput {
  nomor: string;
  lokasiName: string;
  petakNomor: string;
  /** Each Layanan ordered, with the date the family asked for. */
  item: { label: string; targetDate: string }[];
  tagihan: { nomorTagihan: string; total: number; dueAt: Date; tautan: string };
  tautan: string;
}

/**
 * An order Layanan placed (transactional: any hour). It names the price and the
 * deadline, because a standalone Layanan order is paid **before** the work: the
 * message exists so nobody discovers the deadline by opening a bill.
 */
export function layananPesananTerbitEmail(input: LayananPesananTerbitEmailInput): { subject: string; body: string } {
  return {
    subject: `Layanan untuk Petak ${input.petakNomor} di ${input.lokasiName} menunggu pembayaran`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pesanan layanan Anda di ${input.lokasiName} untuk Petak ${input.petakNomor} sudah kami terima.`,
      ...input.item.map((satu) => `- ${satu.label}, dikerjakan ${formatTanggal(satu.targetDate)}.`),
      `Tagihan ${input.tagihan.nomorTagihan} sebesar ${formatRupiah(input.tagihan.total)} jatuh tempo ${formatTanggalJam(input.tagihan.dueAt)}.`,
      "Layanan dikerjakan setelah pembayaran masuk, jadi jangan lupa membayar sebelum tenggatnya.",
      "",
      `Bayar di: ${input.tagihan.tautan}`,
      `Ikuti pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface LayananTpuPesananTerbitEmailInput {
  nomor: string;
  tpuName: string;
  blokNomor: string;
  item: { label: string; targetDate: string }[];
  tagihan: { nomorTagihan: string; total: number; dueAt: Date; tautan: string };
  tautan: string;
}

/**
 * An order Layanan at a DKI TPU placed (transactional: any hour). Like the Lokasi
 * Mitra one it names the price and the deadline, because a standalone order is paid
 * **before** the work; it is worded for a grave the family described, not a Petak.
 */
export function layananTpuPesananTerbitEmail(input: LayananTpuPesananTerbitEmailInput): { subject: string; body: string } {
  return {
    subject: `Layanan untuk makam di ${input.tpuName} menunggu pembayaran`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `Pesanan layanan Anda di ${input.tpuName} untuk makam ${input.blokNomor} sudah kami terima.`,
      ...input.item.map((satu) => `- ${satu.label}, dikerjakan ${formatTanggal(satu.targetDate)}.`),
      `Tagihan ${input.tagihan.nomorTagihan} sebesar ${formatRupiah(input.tagihan.total)} jatuh tempo ${formatTanggalJam(input.tagihan.dueAt)}.`,
      "Layanan dikerjakan setelah pembayaran masuk, jadi jangan lupa membayar sebelum tenggatnya.",
      "",
      `Bayar di: ${input.tagihan.tautan}`,
      `Ikuti pesanan Anda di: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}

export interface LayananPekerjaanSelesaiEmailInput {
  nomor: string;
  lokasiName: string;
  petakNomor: string;
  /** The Layanan that was done, in the wording the order kept. */
  label: string;
  selesaiAt: Date;
  /** Each proof, named, with its link to open. */
  bukti: { label: string; tautan: string | null }[];
  tautan: string;
}

/**
 * A job finished (transactional: any hour). It carries the **link to the photo
 * proof** rather than the files: the proof lives in a private store, and the
 * family opens it from their own order page.
 */
export function layananPekerjaanSelesaiEmail(input: LayananPekerjaanSelesaiEmailInput): { subject: string; body: string } {
  return {
    subject: `Layanan selesai: ${input.label} di Petak ${input.petakNomor}`,
    body: [
      "Yth. Bapak/Ibu,",
      "",
      `${input.label} untuk Petak ${input.petakNomor} di ${input.lokasiName} sudah selesai pada ${formatTanggalJam(input.selesaiAt)}.`,
      ...input.bukti.flatMap((satu) => (satu.tautan ? [`${satu.label}: ${satu.tautan}`] : [`${satu.label}: belum bisa dibuka lewat email, ambil di halaman pesanan Anda.`])),
      "Buka halaman pesanan Anda bila foto atau videonya tidak bisa dibuka dari email ini.",
      "",
      `Halaman pesanan: ${input.tautan}`,
      "",
      "Hormat kami,",
      "Tim makam.co.id",
    ].join("\n"),
  };
}
