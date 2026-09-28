/**
 * Payouts (spec, domain module 11; ticket 32): Pencairan items, Potongan and
 * Bukti Pencairan — the Operator paying a Lokasi Mitra or a Mitra Jasa for work
 * that is done, paid for and no longer open to reversal.
 *
 * A Pencairan item is created by a **registered trigger**, not by a screen: the
 * Saat Duka trigger (Lunas **and** Pemakaman recorded) is this ticket's, and the
 * Terencana, Perpanjangan and Layanan triggers arrive with tickets 37, 40 and 51
 * calling the same functions. The amount is copied from the **issued** Tagihan
 * line and never quoted again, so a tariff entered after the issue cannot move a
 * number the family has already been sent.
 *
 * Money moves in exactly one place, `terbitkanBuktiPencairan`, and it cannot
 * happen twice: a row lock on every item, a one-way status, and a unique index
 * on the Bukti's item lines. See `./transfer.ts`.
 *
 * Owns tables: pencairan_item, potongan, bukti_pencairan, bukti_pencairan_item,
 * bukti_pencairan_potongan, pencairan_pembayaran, pencairan_pemakaman, and —
 * since ticket 31, and for the reason `./refund.ts` sets out — pengembalian,
 * pengembalian_baris, bukti_pengembalian_dana.
 *
 * Every other module's data is reached through that module's own public
 * interface, never its tables: Billing for the issued Tagihan and the document
 * series, Lokasi for the Hari Kerja calendar and the bank account, Identity for
 * who may act, Audit Log for the Entri Audit of every staff write.
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Actor } from "@/domain/identity";
import { addWorkingDays, type Lokasi } from "@/domain/lokasi";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { ReportError } from "@/lib/observability/report-error";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import type { PdfRenderer } from "@/ports/pdf-renderer";
import type { BarisPencairan } from "./baca";
import {
  batalkanPencairanTagihan,
  catatItemLayananMitraJasa,
  itemJatuhTempo,
  kurangiPencairanPesanan,
  turunkanJumlahPencairan,
  type BatalkanTagihanResult,
  type CatatLayananMitraJasaResult,
  type KurangiPesananResult,
  type TurunkanJumlahResult,
} from "./item";
import {
  catatPotongan,
  catatPotonganLunas,
  potonganOfLokasi,
  potonganPerluOffline,
  tickPotonganUsia,
  type BarisPotonganUmum,
  type CatatPotonganInput,
  type CatatPotonganLunasResult,
  type CatatPotonganResult,
} from "./potongan";
import {
  pencairanJatuhTempo,
  pencairanLokasi,
  pencairanMitraJasa,
  type BarisJatuhTempo,
  type PencairanLokasi,
  type PencairanMitraJasa,
} from "./reads";
import {
  buktiPengembalianByLink,
  catatPermintaanPengembalian,
  catatRekeningPengembalian,
  pengembalianById,
  pengembalianDiminta,
  pengembalianSiapDitransfer,
  permintaanTagihan,
  setujuiPengembalian,
  terbitkanBuktiPengembalian,
  type BarisSiapDitransfer,
  type CatatPermintaanPengembalianInput,
  type CatatPermintaanPengembalianResult,
  type CatatRekeningPengembalianResult,
  type DokumenBuktiPengembalian,
  type KirimBuktiPengembalian,
  type PengembalianRow,
  type PermintaanTagihan,
  type SetujuiPengembalianResult,
  type TerbitkanBuktiPengembalianInput,
  type TerbitkanBuktiPengembalianResult,
} from "./refund";
import { jalankanPencairan, tahanPencairan, type TahanPencairanResult } from "./run";
import {
  buktiPencairanByLink,
  terbitkanBuktiPencairan,
  type DokumenBuktiPencairan,
  type KirimBuktiPencairan,
  type TerbitkanBuktiInput,
  type TerbitkanBuktiResult,
} from "./transfer";
import { pemakamanTercatat, tickPencairan, TENGGAT_PENCAIRAN_HARI_KERJA, type TickPencairanResult } from "./trigger";

export { NAMA_EFEK_PENCAIRAN, efekPencairanSaatLunas } from "./efek";
export { BIAYA_LAYANAN_PLATFORM, TENGGAT_PENCAIRAN_HARI_KERJA } from "./trigger";
export { USIA_POTONGAN_HARI } from "./potongan";
export {
  biayaLayananPlatformDikembalikan,
  TENGGAT_PENGEMBALIAN_HARI_KERJA,
  BUKTI_PENGEMBALIAN_MAX_BYTES,
} from "./refund";
export {
  pencairanItemBatalReasons,
  pencairanItemKinds,
  pencairanItemReasons,
  pencairanItemStatuses,
  pengembalianFaults,
  pengembalianPenanggung,
  pengembalianSebabs,
  pengembalianStatuses,
  potonganAlasanKinds,
  potonganStatuses,
  type PengembalianFault,
  type PengembalianPenanggung,
  type PengembalianSebab,
  type PengembalianStatus,
  type PencairanItemBatalReason,
  type PencairanItemKind,
  type PencairanItemReason,
  type PencairanItemStatus,
  type PotonganAlasanKind,
  type PotonganStatus,
} from "./schema";
export type { Penerima } from "./penerima";
export type { BarisItemPencairan, BarisPencairan, BarisPotongan } from "./baca";
export type { BuktiPencairan, DokumenBuktiPencairan, KirimBuktiPencairan, TerbitkanBuktiInput, TerbitkanBuktiResult } from "./transfer";
export type { BarisPotonganUmum, CatatPotonganInput, CatatPotonganLunasResult, CatatPotonganResult } from "./potongan";
export type {
  BarisPengembalian,
  BarisSiapDitransfer,
  BuktiPengembalian,
  BuktiPengembalianTerbit,
  DokumenBuktiPengembalian,
  KirimBuktiPengembalian,
  PengembalianRow,
  PermintaanTagihan,
  RekeningTujuan,
  SetujuiPengembalianResult,
  TagihanRingkasan,
  TerbitkanBuktiPengembalianInput,
  TerbitkanBuktiPengembalianResult,
  CatatPermintaanPengembalianInput,
  CatatPermintaanPengembalianResult,
  CatatRekeningPengembalianResult,
} from "./refund";
export type { BarisJatuhTempo, PencairanLokasi, PencairanMitraJasa, StatusPencairanPesanan } from "./reads";
export type { TahanPencairanResult } from "./run";
export type { TickPencairanResult } from "./trigger";

export interface PayoutsDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** The private FileStore, for the transfer proof a Bukti Pencairan carries. */
  files: FileStore;
  /** The Admin Platform Hari Kerja calendar (the "2 Hari Kerja" deadline) and the bank account to pay. */
  lokasi: Pick<Lokasi, "adminPlatformCalendar" | "lokasiMitra">;
  /** Whether an id is a Lokasi Mitra's at all, so a Potongan is never charged to nothing. */
  lokasiAda: (lokasiId: string) => Promise<boolean>;
  /**
   * The issued Tagihan (never its tables) and the `BKP/YYYY/NNNNNN` series, `within`
   * the issuing transaction — and, for ticket 31's Refunds flow, the `RFD` series,
   * ticket 24's recorded requests, and the Tagihan's own status once money goes back.
   */
  billing: Pick<Billing, "tagihan" | "tagihanDenganPermintaanPengembalian" | "terimaPengembalian" | "within">;
  operatorSettings: Pick<OperatorSettings, "current">;
  /** The Bukti Pencairan page's absolute URL: what the recipient is sent and the PDF rendered from. */
  buktiUrl: (link: string) => string;
  /** "Unduh PDF": the Bukti's own page rendered by the PdfRenderer. */
  pdf: PdfRenderer;
  /** Sends the recipient its Bukti Pencairan link, once the transfer is recorded. */
  kirimBukti: KirimBuktiPencairan;
  /** Sends the Pemesan its Bukti Pengembalian Dana link, once the refund is transferred (ticket 31). */
  kirimBuktiPengembalian: KirimBuktiPengembalian;
  reportError?: ReportError;
}

export interface Payouts {
  // ---- the Saat Duka trigger (AC 9) ----
  /**
   * Records that one order's Pemakaman is recorded: the burial half of the Saat
   * Duka trigger, and what makes that order's items due whichever came first, the
   * money or the burial.
   *
   * **It has no caller in this release.** The Pemakaman module (ticket 25) is the
   * caller, and it is not merged yet, so today only the tests write this fact (see
   * `./trigger.test.ts`, which drives both orders). Nothing else reads the table,
   * so an unrecorded burial simply means no Pencairan items: the trigger waits.
   */
  pemakamanTercatat(tx: Database, input: { nomorPemesanan: string; pemakamanAt: Date }): Promise<void>;
  /**
   * Worker tick: every order whose Tagihan is Lunas **and** whose Pemakaman is
   * recorded gets its Pencairan items, due from the later of the two instants.
   * Idempotent.
   */
  tick(now?: Date): Promise<TickPencairanResult>;
  /** The "2 Hari Kerja" deadline on the Admin Platform calendar, for a trigger of another module. */
  tenggat(dueAt: Date): Promise<Date>;

  // ---- the run and the transfer (AC 5) ----
  /** Every recipient with money waiting, one row each: its due items less the Potongan it carries, and where to pay it. */
  jalankanPencairan(by: Actor): Promise<BarisPencairan[]>;
  /** Admin Platform holds an item out of the runs with a reason, or puts it back. */
  tahanPencairan(by: Actor, input: { itemId: string; alasan: string | null }): Promise<TahanPencairanResult>;
  /** Admin Platform transfers by hand, uploads the proof and enters the date: one Bukti Pencairan covering those items and Potongan. */
  terbitkanBuktiPencairan(by: Actor, input: TerbitkanBuktiInput): Promise<TerbitkanBuktiResult>;
  /** Admin Platform overrides what one item pays after a Keluhan, with a note. */
  turunkanJumlahPencairan(by: Actor, input: { itemId: string; amount: number; catatan: string }): Promise<TurunkanJumlahResult>;
  /**
   * A share the partner agreed to bear on an order (ticket 30), or a refund
   * netted from the partner (ticket 31), takes off that order's Pencairan. The
   * caller runs this inside its own transaction, in the same write that recorded
   * its decision.
   */
  kurangiPencairanPesanan(
    tx: Database,
    input: { nomorPemesanan: string; lokasiId: string; amount: number; alasan: "porsi_pemegang_saham" | "pengembalian_dana"; catatan: string; oleh: string },
  ): Promise<KurangiPesananResult>;
  /**
   * A Tagihan refunded in full to the Pelanggan cancels its items: the work is
   * not paid for and nothing is clawed back afterwards. The Refunds module
   * (ticket 31) calls this in the same transaction that records the refund.
   */
  batalkanPencairanTagihan(tx: Database, input: { tagihanId: string }): Promise<BatalkanTagihanResult>;
  /**
   * The Layanan module (ticket 51) records a Mitra Jasa's job as a Pencairan
   * item, carrying the four things a Mitra Jasa may see about it, and later makes
   * it due when the job's Keluhan window closes — the moment the spec says a
   * job's Pencairan is due.
   */
  catatItemLayananMitraJasa(
    tx: Database,
    input: {
      akunId: string;
      nama: string;
      lokasiId: string | null;
      pekerjaan: string;
      layanan: string | null;
      tanggal: string | null;
      tarif: number;
      nomorPemesanan?: string | null;
      label?: string;
    },
  ): Promise<CatatLayananMitraJasaResult>;
  /** The 2 Hari Kerja deadline for an item that another ticket's trigger has just made due. */
  jadikanJatuhTempo(tx: Database, itemId: string): Promise<{ ok: true } | { ok: false; reason: "tidak_ditemukan" }>;

  // ---- Potongan (AC 4) ----
  /** Admin Platform records an amount a Lokasi Mitra owes: a negative line in its next Pencairan, with a reason and a link. */
  catatPotongan(by: Actor, input: CatatPotonganInput): Promise<CatatPotonganResult>;
  /** Admin Platform records that a Potongan was paid outside a run. */
  catatPotonganLunas(by: Actor, input: { potonganId: string; dibayarPada: string }): Promise<CatatPotonganLunasResult>;
  /** Worker tick: a Potongan 60 days old becomes an offline request, which Admin Platform records when it is paid. Idempotent. */
  tickPotongan(now?: Date): Promise<string[]>;
  /** What one Lokasi Mitra still owes, whatever its state. */
  potonganOfLokasi(lokasiId: string): Promise<BarisPotonganUmum[]>;
  /** Every Potongan waiting to be paid offline, oldest first. */
  potonganPerluOffline(): Promise<BarisPotonganUmum[]>;

  // ---- Refunds and Bukti Pengembalian Dana (ticket 31) ----
  /**
   * Records a refund request, **inside the caller's own transaction**: a refund is
   * always a consequence of something else (a cancellation, a Keluhan, a
   * Pembatalan, a PTSP refusal, a Berhenti leftover, a goodwill decision), and it
   * is part of that module's staff write rather than a second decision of its own.
   * Nothing leaves here: money cannot move until an Admin Platform approves it.
   */
  catatPermintaanPengembalian(
    tx: Database,
    input: CatatPermintaanPengembalianInput,
  ): Promise<CatatPermintaanPengembalianResult>;
  /**
   * Every Tagihan whose cancellation asked for money back, oldest first: the
   * requests ticket 24 records on the bill itself, which this flow approves and
   * pays. Reading them through Billing keeps those two columns private to it.
   */
  permintaanTagihan(): Promise<PermintaanTagihan[]>;
  /** Every refund still waiting for an Admin Platform's decision, oldest first. */
  pengembalianDiminta(): Promise<PengembalianRow[]>;
  /** One refund, or null. */
  pengembalian(pengembalianId: string): Promise<PengembalianRow | null>;
  /**
   * Admin Platform approves a refund. The only gate in the flow (AC 2) and the
   * moment the Tier 3 Antrean row opens with its 2 Hari Kerja deadline (AC 3).
   * Audited, and one-way.
   */
  setujuiPengembalian(by: Actor, input: { pengembalianId: string }): Promise<SetujuiPengembalianResult>;
  /**
   * Records the bank account a refund is paid to (AC 5), entered by the Pemesan or
   * by Admin Platform. Inside the caller's own transaction, and refused once the
   * money has gone: where it went is no longer anyone's to change.
   */
  catatRekeningPengembalian(
    tx: Database,
    input: { pengembalianId: string; rekening: unknown },
  ): Promise<CatatRekeningPengembalianResult>;
  /**
   * Admin Platform transfers by hand, uploads the proof and enters the date: one
   * `RFD/YYYY/NNNNNN` Bukti Pengembalian Dana, the Tagihan moved to Dikembalikan
   * Sebagian or Penuh, the Pemesan told, and the partner's side settled (AC 4, 6, 7).
   */
  terbitkanBuktiPengembalian(by: Actor, input: TerbitkanBuktiPengembalianInput): Promise<TerbitkanBuktiPengembalianResult>;
  /** The Antrean's Tier 3 "refund transfer" row's own query: every approved refund still waiting for its money. */
  pengembalianSiapDitransfer(): Promise<BarisSiapDitransfer[]>;
  /** The Bukti Pengembalian Dana behind an unguessable link. */
  buktiPengembalian(link: string): Promise<DokumenBuktiPengembalian | null>;
  /** "Unduh PDF" of a Bukti Pengembalian Dana, or null for a link that finds none. */
  buktiPengembalianPdf(link: string): Promise<{ fileName: string; bytes: Uint8Array } | null>;

  // ---- reads (AC 6, 7, 8) ----
  /** The Antrean's Tier 3 "Pencairan" row's own query: one open row per recipient, with its deadline. */
  pencairanJatuhTempo(): Promise<BarisJatuhTempo[]>;
  /** One Lokasi Mitra's Pencairan: per order Belum jatuh tempo / Jatuh tempo / Dicairkan, its Bukti Pencairan list and its Potongan. */
  pencairanLokasi(by: Actor, lokasiId: string): Promise<PencairanLokasi>;
  /** A Mitra Jasa's own Pencairan: each job with its Layanan, date, rate and Bukti Pencairan, and nothing else. */
  pencairanMitraJasa(by: Actor): Promise<PencairanMitraJasa>;
  /** The Bukti Pencairan behind an unguessable link: a Mitra Jasa's version shows only job, Layanan, date and rate. */
  buktiPencairan(link: string): Promise<DokumenBuktiPencairan | null>;
  /** "Unduh PDF" of a Bukti Pencairan, or null for a link that finds none. */
  buktiPencairanPdf(link: string): Promise<{ fileName: string; bytes: Uint8Array } | null>;
}

export function createPayouts(deps: PayoutsDeps): Payouts {
  const pemicu = { db: deps.db, clock: deps.clock, billing: deps.billing, lokasi: deps.lokasi, reportError: deps.reportError };
  const itemDeps = { db: deps.db, clock: deps.clock, audit: deps.audit };
  const potonganDeps = { db: deps.db, clock: deps.clock, audit: deps.audit, lokasiAda: deps.lokasiAda };
  const transferDeps = {
    db: deps.db,
    clock: deps.clock,
    audit: deps.audit,
    files: deps.files,
    operatorSettings: deps.operatorSettings,
    billing: deps.billing,
    buktiUrl: deps.buktiUrl,
    kirimBukti: deps.kirimBukti,
    reportError: deps.reportError,
  };
  const runDeps = { db: deps.db, clock: deps.clock, audit: deps.audit, lokasi: deps.lokasi };
  // Refunds (ticket 31) need the same things a Bukti Pencairan does — the private
  // FileStore for the transfer proof, Billing for the Tagihan and the RFD series,
  // the calendar for the 2 Hari Kerja deadline — and one more: a way to tell the
  // Pemesan, which a Bukti Pencairan's recipient is not.
  const refundDeps = {
    db: deps.db,
    clock: deps.clock,
    audit: deps.audit,
    files: deps.files,
    billing: deps.billing,
    lokasi: deps.lokasi,
    operatorSettings: deps.operatorSettings,
    buktiUrl: deps.buktiUrl,
    kirimBukti: deps.kirimBuktiPengembalian,
    ...(deps.reportError ? { reportError: deps.reportError } : {}),
  };
  return {
    pemakamanTercatat: (tx, input) => pemakamanTercatat(tx, input),
    tick: (now) => tickPencairan(pemicu, now ?? deps.clock.now()),
    tenggat: async (dueAt) => tenggat(deps.lokasi, dueAt),
    jalankanPencairan: (by) => jalankanPencairan(runDeps, by),
    tahanPencairan: (by, input) => tahanPencairan(runDeps, by, input),
    terbitkanBuktiPencairan: (by, input) => terbitkanBuktiPencairan(transferDeps, by, input),
    turunkanJumlahPencairan: (by, input) => turunkanJumlahPencairan(itemDeps, by, input),
    kurangiPencairanPesanan: (tx, input) => kurangiPencairanPesanan(tx, input, deps.clock.now()),
    batalkanPencairanTagihan: (tx, input) => batalkanPencairanTagihan(tx, { tagihanId: input.tagihanId, alasan: "dikembalikan_penuh" }, deps.clock.now()),
    catatItemLayananMitraJasa: (tx, input) => catatItemLayananMitraJasa(tx, input, deps.clock.now()),
    jadikanJatuhTempo: async (tx, itemId) => itemJatuhTempo(tx, itemId, { now: deps.clock.now(), jatuhTempoAt: await tenggat(deps.lokasi, deps.clock.now()) }),
    catatPotongan: (by, input) => catatPotongan(potonganDeps, by, input),
    catatPermintaanPengembalian: (tx, input) => catatPermintaanPengembalian(refundDeps, tx, input, deps.clock.now()),
    permintaanTagihan: () => permintaanTagihan({ billing: deps.billing }),
    pengembalianDiminta: () => pengembalianDiminta(deps.db),
    pengembalian: (pengembalianId) => pengembalianById(deps.db, pengembalianId),
    setujuiPengembalian: (by, input) => setujuiPengembalian(refundDeps, by, input),
    catatRekeningPengembalian: (tx, input) => catatRekeningPengembalian(refundDeps, tx, input),
    terbitkanBuktiPengembalian: (by, input) => terbitkanBuktiPengembalian(refundDeps, by, input),
    pengembalianSiapDitransfer: () => pengembalianSiapDitransfer(deps.db),
    buktiPengembalian: (link) => buktiPengembalianByLink(deps.db, link),
    buktiPengembalianPdf: async (link) => {
      const document = await buktiPengembalianByLink(deps.db, link);
      if (!document) return null;
      const bytes = await deps.pdf.render({ url: deps.buktiUrl(link) });
      return { fileName: `${document.nomorBukti.replaceAll("/", "-")}.pdf`, bytes };
    },
    catatPotonganLunas: (by, input) => catatPotonganLunas(potonganDeps, by, input),
    tickPotongan: (now) => tickPotonganUsia(deps.db, now ?? deps.clock.now()),
    potonganOfLokasi: (lokasiId) => potonganOfLokasi(deps.db, lokasiId),
    potonganPerluOffline: () => potonganPerluOffline(deps.db),
    pencairanJatuhTempo: () => pencairanJatuhTempo(deps.db),
    pencairanLokasi: (by, lokasiId) => pencairanLokasi(deps.db, by, lokasiId),
    pencairanMitraJasa: (by) => pencairanMitraJasa(deps.db, by),
    buktiPencairan: (link) => buktiPencairanByLink(deps.db, link),
    buktiPencairanPdf: async (link) => {
      const document = await buktiPencairanByLink(deps.db, link);
      if (!document) return null;
      const bytes = await deps.pdf.render({ url: deps.buktiUrl(link) });
      return { fileName: `${document.nomorBukti.replaceAll("/", "-")}.pdf`, bytes };
    },
  };
}

/** The 2 Hari Kerja deadline on the Admin Platform calendar, which the tick reads once for a whole run. */
function tenggat(lokasi: Pick<Lokasi, "adminPlatformCalendar">, dueAt: Date): Promise<Date> {
  return lokasi.adminPlatformCalendar().then((calendar) => {
    const deadline = addWorkingDays(calendar, dueAt, TENGGAT_PENCAIRAN_HARI_KERJA);
    if (!deadline.ok) throw new Error(`the Admin Platform calendar has no Hari Kerja ahead of ${dueAt.toISOString()}`);
    return deadline.at;
  });
}
