/**
 * Payouts (spec, domain module 11; ticket 32): Pencairan items, Potongan and
 * Bukti Pencairan — the Operator paying a Lokasi Mitra or a Mitra Jasa for work
 * that is done, paid for and no longer open to reversal.
 *
 * A Pencairan item is created by a **registered trigger**, not by a screen: the
 * Saat Duka trigger (Lunas **and** Pemakaman recorded) is this ticket's, and the
 * Terencana, Perpanjangan and Layanan triggers arrive with tickets 37, 40 and 51
 * calling the same functions (`./layanan.ts` is the Layanan one). The amount is copied from the **issued** Tagihan
 * line and never quoted again, so a tariff entered after the issue cannot move a
 * number the family has already been sent.
 *
 * Money moves in exactly one place, `terbitkanBuktiPencairan`, and it cannot
 * happen twice: a row lock on every item, a one-way status, and a unique index
 * on the Bukti's item lines. See `./transfer.ts`.
 *
 * Owns tables: pencairan_item, potongan, bukti_pencairan, bukti_pencairan_item,
 * bukti_pencairan_potongan, pencairan_pembayaran, pencairan_pemakaman,
 * pencairan_terencana.
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
import { sudahDicairkanUntukTagihan, type BarisPencairan } from "./baca";
import { itemLayananOf, jadikanLayananJatuhTempo, type ItemLayanan, type LayananJatuhTempoResult } from "./layanan";
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
import { batalkanPembayaranLangsung, type BatalkanPembayaranLangsungResult } from "./pembayaran-langsung";
import { jalankanPencairan, tahanPencairan, type TahanPencairanResult } from "./run";
import {
  buktiPencairanByLink,
  terbitkanBuktiPencairan,
  type DokumenBuktiPencairan,
  type KirimBuktiPencairan,
  type TerbitkanBuktiInput,
  type TerbitkanBuktiResult,
} from "./transfer";
import { masaPembatalanDimulai, pemakamanTercatat, tickPencairan, TENGGAT_PENCAIRAN_HARI_KERJA, type TickPencairanResult } from "./trigger";

export { NAMA_EFEK_PENCAIRAN, efekPencairanSaatLunas } from "./efek";
export { BIAYA_LAYANAN_PLATFORM, TENGGAT_PENCAIRAN_HARI_KERJA } from "./trigger";
export { USIA_POTONGAN_HARI } from "./potongan";
export {
  pencairanItemBatalReasons,
  pencairanItemKinds,
  pencairanItemReasons,
  pencairanItemStatuses,
  potonganAlasanKinds,
  potonganStatuses,
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
export type { BatalkanPembayaranLangsungResult } from "./pembayaran-langsung";
export type { BarisJatuhTempo, PencairanLokasi, PencairanMitraJasa, StatusPencairanPesanan } from "./reads";
export type { TahanPencairanResult } from "./run";
export type { TickPencairanResult } from "./trigger";
export type { ItemLayanan, LayananJatuhTempoResult } from "./layanan";

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
  /** The issued Tagihan (never its tables) and the `BKP/YYYY/NNNNNN` series, `within` the issuing transaction. */
  billing: Pick<Billing, "tagihan" | "within" | "pembayaranPerluDitinjau">;
  operatorSettings: Pick<OperatorSettings, "current">;
  /** The Bukti Pencairan page's absolute URL: what the recipient is sent and the PDF rendered from. */
  buktiUrl: (link: string) => string;
  /** "Unduh PDF": the Bukti's own page rendered by the PdfRenderer. */
  pdf: PdfRenderer;
  /** Sends the recipient its Bukti Pencairan link, once the transfer is recorded. */
  kirimBukti: KirimBuktiPencairan;
  reportError?: ReportError;
}

/** The Masa Pembatalan half of the Terencana trigger, for the payment effect that cannot hold the module (Payouts is composed after Billing). */
export { masaPembatalanDimulai } from "./trigger";

export interface Payouts {
  // ---- the Saat Duka trigger (AC 9) ----
  /**
   * Records that one order's Pemakaman is recorded: the burial half of the Saat
   * Duka trigger, and what makes that order's items due whichever came first, the
   * money or the burial.
   *
   * The caller is the Pemesanan module's Catat Pemakaman, inside the transaction
   * that records the burial (ticket 90; `./pemakaman-tercatat.test.ts` walks that
   * path, `./trigger.test.ts` writes the fact directly). An unrecorded burial
   * simply means no Pencairan items: the trigger waits.
   */
  pemakamanTercatat(tx: Database, input: { nomorPemesanan: string; pemakamanAt: Date }): Promise<void>;
  /**
   * Records that a paid Pemesanan Terencana's Masa Pembatalan ends at `berakhirPada`:
   * the trigger of its Hak Pakai item (ticket 37). The Pemesanan module calls it in
   * the transaction that makes the order Aktif; the item itself is the tick's.
   */
  masaPembatalanDimulai(tx: Database, input: { nomorPemesanan: string; berakhirPada: Date }): Promise<void>;
  /**
   * Worker tick: every order whose Tagihan is Lunas **and** whose Pemakaman is
   * recorded gets its Pencairan items, due from the later of the two instants; a
   * paid Pemesanan Terencana gets its Hak Pakai item at the end of its Masa
   * Pembatalan, or at the first Pemakaman if that came sooner. Idempotent.
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
   * Admin Platform reverses a "Dibayar langsung ke Lokasi Mitra" record
   * (ticket 30's AC 2): the platform-fee Potongan it raised is cancelled (or,
   * if the tick has not run yet, nothing has been raised at all), and the
   * order's ordinary tariff Pencairan is created on the next tick instead.
   */
  batalkanPembayaranLangsung(by: Actor, input: { tagihanId: string }): Promise<BatalkanPembayaranLangsungResult>;
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
   * What a Tagihan's items already paid to a Lokasi Mitra come to, by Lokasi:
   * what `batalkanPencairanTagihan` left alone. The Refunds module (ticket 31)
   * reads this to know whether a full refund owes a Potongan, and for how much.
   */
  sudahDicairkanUntukTagihan(tagihanId: string): Promise<{ lokasiId: string; amount: number }[]>;
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
  /**
   * The item a Tagihan's Layanan line produced, or null while there is none (the Tagihan is not
   * paid yet, or it was paid straight to the Lokasi Mitra). The Layanan module (ticket 51) reads
   * it to make the item due and so that Admin Platform can override what it pays after a Keluhan.
   */
  itemLayanan(tagihanId: string, tagihanPosisi: number, within?: Database): Promise<ItemLayanan | null>;
  /**
   * The Layanan trigger (ticket 51): makes one Layanan line's item due when its job's Keluhan
   * window closes with no Keluhan, a Keluhan is rejected, or the redo proof is shown. The Layanan
   * module calls it on the transaction that records that fact, and again on its tick while the
   * answer is `belum_ada` (the Lunas half has not written the item yet). Idempotent.
   */
  jadikanLayananJatuhTempo(tx: Database, input: { tagihanId: string; tagihanPosisi: number }): Promise<LayananJatuhTempoResult>;
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
  return {
    pemakamanTercatat: (tx, input) => pemakamanTercatat(tx, input),
    masaPembatalanDimulai: (tx, input) => masaPembatalanDimulai(tx, input),
    tick: (now) => tickPencairan(pemicu, now ?? deps.clock.now()),
    tenggat: async (dueAt) => tenggat(deps.lokasi, dueAt),
    jalankanPencairan: (by) => jalankanPencairan(runDeps, by),
    tahanPencairan: (by, input) => tahanPencairan(runDeps, by, input),
    terbitkanBuktiPencairan: (by, input) => terbitkanBuktiPencairan(transferDeps, by, input),
    turunkanJumlahPencairan: (by, input) => turunkanJumlahPencairan(itemDeps, by, input),
    batalkanPembayaranLangsung: (by, input) => batalkanPembayaranLangsung(potonganDeps, by, input),
    kurangiPencairanPesanan: (tx, input) => kurangiPencairanPesanan(tx, input, deps.clock.now()),
    batalkanPencairanTagihan: (tx, input) => batalkanPencairanTagihan(tx, { tagihanId: input.tagihanId, alasan: "dikembalikan_penuh" }, deps.clock.now()),
    sudahDicairkanUntukTagihan: (tagihanId) => sudahDicairkanUntukTagihan(deps.db, tagihanId),
    catatItemLayananMitraJasa: (tx, input) => catatItemLayananMitraJasa(tx, input, deps.clock.now()),
    itemLayanan: (tagihanId, posisi, within) => itemLayananOf(within ?? deps.db, tagihanId, posisi),
    jadikanLayananJatuhTempo: (tx, input) =>
      jadikanLayananJatuhTempo(tx, input, {
        now: deps.clock.now(),
        jatuhTempoAt: () => tenggat(deps.lokasi, deps.clock.now()),
      }),
    jadikanJatuhTempo: async (tx, itemId) => itemJatuhTempo(tx, itemId, { now: deps.clock.now(), jatuhTempoAt: await tenggat(deps.lokasi, deps.clock.now()) }),
    catatPotongan: (by, input) => catatPotongan(potonganDeps, by, input),
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
