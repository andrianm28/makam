/**
 * The Laporan (spec, Work Queues; ticket 33, story 165): a monthly report for
 * Admin Platform (orders, Rp collected, platform fees, Pencairan, refunds, Tidak
 * Tertagih), exportable as CSV, and a weekly list of every outgoing transfer
 * (Pencairan and refunds) with its proof, so the books can be reviewed without a
 * second approver.
 *
 * This module only composes: each figure is asked of the module that owns it
 * (Billing, Payouts, Refunds), for a span this file cuts at the Asia/Jakarta
 * boundary, and no money rule lives here. A month is "YYYY-MM"; a week runs
 * Monday to Sunday (Senin first, the order of `NAMA_HARI`) and is named by any
 * WIB date inside it.
 *
 * The CSV is a rendering of the very rows the page shows (`barisLaporan`), so the
 * two cannot drift apart.
 */
import { z } from "zod";
import { authorize, laporanResource, type Actor } from "@/domain/identity";
import type { Billing, MetodeBayarKind, PesananKind } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Payouts } from "@/domain/payouts";
import type { Refunds } from "@/domain/refunds";
import { addWibDateDays, wib, wibWeekdayIndex } from "@/lib/time/jakarta";

/** A calendar month, "2026-10". */
export const bulanLaporanSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
/** Any WIB calendar date, "2026-10-14": it names the week it falls in. */
export const tanggalMingguSchema = z.iso.date();

export type LaporanRefusal = { ok: false; reason: "tidak_berwenang" | "perlu_totp" | "input_tidak_valid" };

export interface LaporanDeps {
  billing: Pick<Billing, "laporan">;
  payouts: Pick<Payouts, "pencairanDibayar" | "transferKeluar">;
  refunds: Pick<Refunds, "pengembalianDibayar" | "transferKeluar">;
  identity: Pick<Identity, "staffAccounts">;
}

const NAMA_PESANAN: Record<PesananKind, string> = {
  saat_duka: "Pemesanan Saat Duka",
  pemakaman_hak_pakai_ada: "Pemakaman di Hak Pakai yang sudah ada",
  terencana: "Pemesanan Terencana",
  perpanjangan: "Perpanjangan Makam",
  pengurusan_berkas: "Pengurusan IPTM (berkas)",
  layanan: "Pesanan Layanan",
  paket_cycle: "Siklus Paket Layanan",
};

const NAMA_METODE: Record<MetodeBayarKind, string> = {
  penyedia_pembayaran: "Penyedia pembayaran (QRIS dan lainnya)",
  transfer_manual: "Transfer manual",
  tunai: "Tunai",
  langsung_ke_lokasi: "Dibayar langsung ke Lokasi Mitra",
  tanpa_pembayaran: "Tanpa pembayaran (Rp 0)",
};

/**
 * The month's Laporan: numbers only, in whole rupiah, cut at the Asia/Jakarta month.
 * Every figure is dated by the moment it happened: money and orders by the payment, a
 * Pencairan or refund by the transfer date Admin Platform entered, a Tidak Tertagih by
 * the day it was declared.
 */
export interface Laporan {
  /** "2026-10". */
  bulan: string;
  /** First WIB date of the month, and the first date after it. */
  dari: string;
  sampai: string;
  /** Orders paid in the month, one each whatever number of Tagihan, by kind. */
  pesanan: { kind: PesananKind; jumlah: number }[];
  diterima: { metode: MetodeBayarKind; jumlahPembayaran: number; amount: number }[];
  /** Money the Operator itself received: every method except "Dibayar langsung ke Lokasi Mitra". */
  totalDiterimaOperator: number;
  biaya: {
    /** Gross fee lines of what the Operator received in the month. */
    biayaLayananPlatformKotor: number;
    /** The Biaya Layanan Platform a refund transferred in the month handed back to the family. */
    biayaLayananPlatformDikembalikan: number;
    /** Kotor less dikembalikan: what the Operator earned. */
    biayaLayananPlatform: number;
    biayaPengurusan: number;
  };
  pencairan: {
    lokasiMitra: { jumlahBukti: number; bruto: number };
    mitraJasa: { jumlahBukti: number; bruto: number };
    jumlahBukti: number;
    /** What the transfers covered before Potongan. */
    bruto: number;
    /** The Potongan netted off them: money the Lokasi Mitra owed the Operator. */
    potongan: number;
    /** What left the bank: bruto less potongan. */
    neto: number;
  };
  pengembalian: { jumlahBukti: number; amount: number };
  /** Received less refunds, less Pencairan bruto, plus the Potongan netted: the month's cash movement. */
  arusKasBersih: number;
  tidakTertagih: { jumlah: number; amount: number };
  /** Tagihan declared Tidak Tertagih in an earlier month that were paid in this one. */
  dibayarSetelahTidakTertagih: { jumlah: number; amount: number };
}

export type LaporanResult = { ok: true; laporan: Laporan } | LaporanRefusal;

function refusal(by: Actor): LaporanRefusal | null {
  const authorization = authorize(by, "laporan.lihat", laporanResource());
  if (authorization.allowed) return null;
  return { ok: false, reason: authorization.reason === "perlu_totp" ? "perlu_totp" : "tidak_berwenang" };
}

/** The first date of the month after `bulan`. */
function bulanBerikutnya(bulan: string): string {
  const [tahun, nomor] = bulan.split("-").map(Number) as [number, number];
  return nomor === 12 ? `${tahun + 1}-01-01` : `${tahun}-${String(nomor + 1).padStart(2, "0")}-01`;
}

/** The Laporan of one month. */
export async function laporanBulanan(deps: LaporanDeps, by: Actor, bulanInput: string): Promise<LaporanResult> {
  const ditolak = refusal(by);
  if (ditolak) return ditolak;
  const parsed = bulanLaporanSchema.safeParse(bulanInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const bulan = parsed.data;
  const dari = `${bulan}-01`;
  const sampai = bulanBerikutnya(bulan);

  const [billing, pencairan, pengembalian] = await Promise.all([
    deps.billing.laporan(by, { dari: wib(dari), sampai: wib(sampai) }),
    deps.payouts.pencairanDibayar(by, { dari, sampai }),
    deps.refunds.pengembalianDibayar(by, { dari, sampai }),
  ]);
  if (!billing.ok) return billing;
  const uang = billing.laporan;
  const biayaLayananPlatform = uang.biaya.biayaLayananPlatform - pengembalian.biayaLayananPlatformDikembalikan;
  const pencairanBruto = pencairan.lokasiMitra.bruto + pencairan.mitraJasa.bruto;
  const potongan = pencairan.lokasiMitra.potongan + pencairan.mitraJasa.potongan;

  return {
    ok: true,
    laporan: {
      bulan,
      dari,
      sampai,
      pesanan: uang.pesanan,
      diterima: uang.diterima,
      totalDiterimaOperator: uang.totalDiterimaOperator,
      biaya: {
        biayaLayananPlatformKotor: uang.biaya.biayaLayananPlatform,
        biayaLayananPlatformDikembalikan: pengembalian.biayaLayananPlatformDikembalikan,
        biayaLayananPlatform,
        biayaPengurusan: uang.biaya.biayaPengurusan,
      },
      pencairan: {
        lokasiMitra: { jumlahBukti: pencairan.lokasiMitra.jumlahBukti, bruto: pencairan.lokasiMitra.bruto },
        mitraJasa: { jumlahBukti: pencairan.mitraJasa.jumlahBukti, bruto: pencairan.mitraJasa.bruto },
        jumlahBukti: pencairan.lokasiMitra.jumlahBukti + pencairan.mitraJasa.jumlahBukti,
        bruto: pencairanBruto,
        potongan,
        neto: pencairanBruto - potongan,
      },
      pengembalian: { jumlahBukti: pengembalian.jumlahBukti, amount: pengembalian.amount },
      arusKasBersih: uang.totalDiterimaOperator - pengembalian.amount - pencairanBruto + potongan,
      tidakTertagih: uang.tidakTertagih,
      dibayarSetelahTidakTertagih: uang.dibayarSetelahTidakTertagih,
    },
  };
}

/** One line of the Laporan, as the page shows it and the CSV holds it. */
export interface BarisLaporan {
  bagian: string;
  keterangan: string;
  /** How many (orders, payments, Bukti); null for a line that is only an amount. */
  jumlah: number | null;
  /** Whole rupiah, signed: money in is positive, money out (refunds, Pencairan) negative; null for a line that is only a count. */
  amount: number | null;
}

/** The Laporan as flat rows, in reading order: the one source of both the screen and the CSV. */
export function barisLaporan(laporan: Laporan): BarisLaporan[] {
  const baris: BarisLaporan[] = [];
  for (const row of laporan.pesanan) baris.push({ bagian: "Pesanan dibayar", keterangan: NAMA_PESANAN[row.kind], jumlah: row.jumlah, amount: null });
  for (const row of laporan.diterima) baris.push({ bagian: "Rp diterima", keterangan: NAMA_METODE[row.metode], jumlah: row.jumlahPembayaran, amount: row.amount });
  baris.push({ bagian: "Rp diterima", keterangan: "Total diterima Operator (tanpa yang dibayar langsung ke Lokasi Mitra)", jumlah: null, amount: laporan.totalDiterimaOperator });
  baris.push({ bagian: "Pendapatan Operator", keterangan: "Biaya Layanan Platform (kotor)", jumlah: null, amount: laporan.biaya.biayaLayananPlatformKotor });
  baris.push({ bagian: "Pendapatan Operator", keterangan: "Dikurangi Biaya Layanan Platform yang dikembalikan", jumlah: null, amount: -laporan.biaya.biayaLayananPlatformDikembalikan });
  baris.push({ bagian: "Pendapatan Operator", keterangan: "Biaya Layanan Platform (bersih)", jumlah: null, amount: laporan.biaya.biayaLayananPlatform });
  baris.push({ bagian: "Pendapatan Operator", keterangan: "Biaya Pengurusan", jumlah: null, amount: laporan.biaya.biayaPengurusan });
  baris.push({ bagian: "Pengembalian dana dibayar", keterangan: "Total pengembalian dana", jumlah: laporan.pengembalian.jumlahBukti, amount: -laporan.pengembalian.amount });
  baris.push({ bagian: "Pencairan dibayar", keterangan: "Lokasi Mitra", jumlah: laporan.pencairan.lokasiMitra.jumlahBukti, amount: -laporan.pencairan.lokasiMitra.bruto });
  baris.push({ bagian: "Pencairan dibayar", keterangan: "Mitra Jasa", jumlah: laporan.pencairan.mitraJasa.jumlahBukti, amount: -laporan.pencairan.mitraJasa.bruto });
  baris.push({ bagian: "Pencairan dibayar", keterangan: "Potongan dipotong dari Pencairan", jumlah: null, amount: laporan.pencairan.potongan });
  baris.push({ bagian: "Pencairan dibayar", keterangan: "Total Pencairan yang keluar dari bank", jumlah: laporan.pencairan.jumlahBukti, amount: -laporan.pencairan.neto });
  baris.push({ bagian: "Arus kas", keterangan: "Diterima Operator dikurangi pengembalian dana dan Pencairan, ditambah Potongan", jumlah: null, amount: laporan.arusKasBersih });
  baris.push({ bagian: "Tidak Tertagih", keterangan: "Dinyatakan Tidak Tertagih bulan ini", jumlah: laporan.tidakTertagih.jumlah, amount: laporan.tidakTertagih.amount });
  baris.push({ bagian: "Tidak Tertagih", keterangan: "Dibayar bulan ini setelah dinyatakan Tidak Tertagih", jumlah: laporan.dibayarSetelahTidakTertagih.jumlah, amount: laporan.dibayarSetelahTidakTertagih.amount });
  return baris;
}

/** A CSV cell: quoted when needed, and a text that a spreadsheet would read as a formula (`= + - @`) is made plain text. Numbers are written as they are. */
export function selCsv(nilai: string | number | null): string {
  if (nilai === null) return "";
  const teks = typeof nilai === "string" && /^[=+\-@\t\r]/.test(nilai) ? `'${nilai}` : String(nilai);
  return /[",\r\n]/.test(teks) ? `"${teks.replaceAll('"', '""')}"` : teks;
}

/** The Laporan as CSV (RFC 4180, CRLF): the same rows as the page, amounts as plain signed whole-rupiah integers. */
export function laporanKeCsv(laporan: Laporan): string {
  const kepala = [`Laporan ${laporan.bulan} (WIB, ${laporan.dari} sampai sebelum ${laporan.sampai})`];
  const baris = [
    kepala.map(selCsv).join(","),
    ["Bagian", "Keterangan", "Jumlah", "Rp"].join(","),
    ...barisLaporan(laporan).map((row) => [row.bagian, row.keterangan, row.jumlah, row.amount].map(selCsv).join(",")),
  ];
  return `${baris.join("\r\n")}\r\n`;
}

/** One outgoing transfer of the weekly list. */
export interface TransferKeluar {
  jenis: "pencairan" | "pengembalian";
  /** WIB date of the bank transfer. */
  tanggal: string;
  penerima: string;
  amount: number;
  /** Bukti Pencairan (BKP/…) or Bukti Pengembalian Dana (RFD/…). */
  nomorBukti: string;
  /** Who approved it: the Admin Platform's name, or its email when it carries no name; null when none is on record. */
  disetujuiOleh: string | null;
  /** The Bukti's own page. */
  hrefBukti: string;
  /** The uploaded transfer proof, a link that stops working after a few minutes. */
  buktiTransferUrl: string | null;
}

export interface DaftarTransfer {
  /** The Monday of the week, and the Monday after it (exclusive). */
  dari: string;
  sampai: string;
  transfer: TransferKeluar[];
  total: { pencairan: number; pengembalian: number; semua: number };
}

export type DaftarTransferResult = { ok: true; daftar: DaftarTransfer } | LaporanRefusal;

/** The Monday (WIB) of the week a date falls in. */
export function seninMinggu(tanggal: string): string {
  return addWibDateDays(tanggal, -wibWeekdayIndex(wib(tanggal)));
}

/** Every transfer that left the bank in one week, Pencairan and refunds together, oldest first. */
export async function daftarTransferMingguan(deps: LaporanDeps, by: Actor, tanggalInput: string): Promise<DaftarTransferResult> {
  const ditolak = refusal(by);
  if (ditolak) return ditolak;
  const parsed = tanggalMingguSchema.safeParse(tanggalInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const dari = seninMinggu(parsed.data);
  const sampai = addWibDateDays(dari, 7);

  const [pencairan, pengembalian, staf] = await Promise.all([
    deps.payouts.transferKeluar(by, { dari, sampai }),
    deps.refunds.transferKeluar(by, { dari, sampai }),
    deps.identity.staffAccounts(),
  ]);
  const nama = new Map(staf.map((akun) => [akun.accountId, akun.name || akun.email || akun.accountId]));
  const dinamai = (accountId: string | null) => (accountId === null ? null : (nama.get(accountId) ?? accountId));

  const transfer: TransferKeluar[] = [
    ...pencairan.map((row) => ({
      jenis: row.jenis,
      tanggal: row.ditransferPada,
      penerima: row.penerima,
      amount: row.amount,
      nomorBukti: row.nomorBukti,
      disetujuiOleh: dinamai(row.disetujuiOleh),
      hrefBukti: `/dokumen/${encodeURIComponent(row.link)}`,
      buktiTransferUrl: row.buktiTransferUrl,
    })),
    ...pengembalian.map((row) => ({
      jenis: row.jenis,
      tanggal: row.ditransferPada,
      penerima: row.penerima,
      amount: row.amount,
      nomorBukti: row.nomorBukti,
      disetujuiOleh: dinamai(row.disetujuiOleh),
      hrefBukti: `/dokumen/${encodeURIComponent(row.link)}`,
      buktiTransferUrl: row.buktiTransferUrl,
    })),
  ].sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.nomorBukti.localeCompare(b.nomorBukti));

  const jumlah = (jenis: TransferKeluar["jenis"]) => transfer.filter((row) => row.jenis === jenis).reduce((sum, row) => sum + row.amount, 0);
  const totalPencairan = jumlah("pencairan");
  const totalPengembalian = jumlah("pengembalian");
  return { ok: true, daftar: { dari, sampai, transfer, total: { pencairan: totalPencairan, pengembalian: totalPengembalian, semua: totalPencairan + totalPengembalian } } };
}
