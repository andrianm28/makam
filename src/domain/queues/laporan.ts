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

/** The month's Laporan: numbers only, in whole rupiah, cut at the Asia/Jakarta month. */
export interface Laporan {
  /** "2026-10". */
  bulan: string;
  /** First WIB date of the month, and the first date after it. */
  dari: string;
  sampai: string;
  pesanan: { kind: PesananKind; jumlah: number }[];
  diterima: { metode: MetodeBayarKind; jumlahPembayaran: number; amount: number }[];
  /** Money the Operator itself received: every method except "Dibayar langsung ke Lokasi Mitra", which never reached the Operator's account. */
  totalDiterimaOperator: number;
  biaya: { biayaLayananPlatform: number; biayaPengurusan: number };
  pencairan: { lokasiMitra: { jumlahBukti: number; amount: number }; mitraJasa: { jumlahBukti: number; amount: number }; jumlahBukti: number; amount: number };
  pengembalian: { jumlahBukti: number; amount: number };
  tidakTertagih: { jumlah: number; amount: number };
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
    deps.billing.laporan({ dari: wib(dari), sampai: wib(sampai) }),
    deps.payouts.pencairanDibayar(by, { dari, sampai }),
    deps.refunds.pengembalianDibayar(by, { dari, sampai }),
  ]);

  return {
    ok: true,
    laporan: {
      bulan,
      dari,
      sampai,
      pesanan: billing.pesanan,
      diterima: billing.diterima,
      totalDiterimaOperator: billing.diterima.filter((row) => row.metode !== "langsung_ke_lokasi").reduce((sum, row) => sum + row.amount, 0),
      biaya: billing.biaya,
      pencairan: {
        ...pencairan,
        jumlahBukti: pencairan.lokasiMitra.jumlahBukti + pencairan.mitraJasa.jumlahBukti,
        amount: pencairan.lokasiMitra.amount + pencairan.mitraJasa.amount,
      },
      pengembalian,
      tidakTertagih: billing.tidakTertagih,
    },
  };
}

/** One line of the Laporan, as the page shows it and the CSV holds it. */
export interface BarisLaporan {
  bagian: string;
  keterangan: string;
  /** How many (orders, payments, Bukti); null for a line that is only an amount. */
  jumlah: number | null;
  /** Whole rupiah; null for a line that is only a count. */
  amount: number | null;
}

/** The Laporan as flat rows, in reading order: the one source of both the screen and the CSV. */
export function barisLaporan(laporan: Laporan): BarisLaporan[] {
  const baris: BarisLaporan[] = [];
  for (const row of laporan.pesanan) baris.push({ bagian: "Pesanan", keterangan: NAMA_PESANAN[row.kind], jumlah: row.jumlah, amount: null });
  for (const row of laporan.diterima) baris.push({ bagian: "Rp diterima", keterangan: NAMA_METODE[row.metode], jumlah: row.jumlahPembayaran, amount: row.amount });
  baris.push({ bagian: "Rp diterima", keterangan: "Total diterima Operator (tanpa yang dibayar langsung ke Lokasi Mitra)", jumlah: null, amount: laporan.totalDiterimaOperator });
  baris.push({ bagian: "Pendapatan Operator", keterangan: "Biaya Layanan Platform", jumlah: null, amount: laporan.biaya.biayaLayananPlatform });
  baris.push({ bagian: "Pendapatan Operator", keterangan: "Biaya Pengurusan", jumlah: null, amount: laporan.biaya.biayaPengurusan });
  baris.push({ bagian: "Pencairan dibayar", keterangan: "Lokasi Mitra", jumlah: laporan.pencairan.lokasiMitra.jumlahBukti, amount: laporan.pencairan.lokasiMitra.amount });
  baris.push({ bagian: "Pencairan dibayar", keterangan: "Mitra Jasa", jumlah: laporan.pencairan.mitraJasa.jumlahBukti, amount: laporan.pencairan.mitraJasa.amount });
  baris.push({ bagian: "Pencairan dibayar", keterangan: "Total Pencairan", jumlah: laporan.pencairan.jumlahBukti, amount: laporan.pencairan.amount });
  baris.push({ bagian: "Pengembalian dana dibayar", keterangan: "Total pengembalian dana", jumlah: laporan.pengembalian.jumlahBukti, amount: laporan.pengembalian.amount });
  baris.push({ bagian: "Tidak Tertagih", keterangan: "Tagihan dinyatakan Tidak Tertagih", jumlah: laporan.tidakTertagih.jumlah, amount: laporan.tidakTertagih.amount });
  return baris;
}

function sel(nilai: string | number | null): string {
  if (nilai === null) return "";
  const teks = String(nilai);
  return /[",\r\n]/.test(teks) ? `"${teks.replaceAll('"', '""')}"` : teks;
}

/** The Laporan as CSV (RFC 4180, CRLF): the same rows as the page, amounts as plain whole-rupiah integers. */
export function laporanKeCsv(laporan: Laporan): string {
  const kepala = [`Laporan ${laporan.bulan} (WIB, ${laporan.dari} sampai sebelum ${laporan.sampai})`];
  const baris = [
    kepala.map(sel).join(","),
    ["Bagian", "Keterangan", "Jumlah", "Rp"].join(","),
    ...barisLaporan(laporan).map((row) => [row.bagian, row.keterangan, row.jumlah, row.amount].map(sel).join(",")),
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
