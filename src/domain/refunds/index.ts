/**
 * Refunds (spec, domain module 10, Billing > Refunds; ticket 31): one flow for
 * the whole platform. A refund request names the Tagihan, the lines refunded
 * and whether the Biaya Layanan Platform is kept, under the fault rule
 * (`aturan.ts`). Admin Platform approves every refund, then transfers by hand,
 * uploads the proof and enters the date, which issues a Bukti Pengembalian
 * Dana and moves the Tagihan to Dikembalikan sebagian / penuh.
 *
 * Owns tables: permintaan_pengembalian, bukti_pengembalian_dana.
 *
 * Composed after Billing and Payouts (it reads a Tagihan and numbers a Bukti
 * through Billing, and nets a refund through Payouts), so neither of those
 * modules may depend on this one — a downstream module, not a peer, exactly
 * like Payouts sits after Billing.
 */
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Actor } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { Payouts } from "@/domain/payouts";
import type { ReportError } from "@/lib/observability/report-error";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import {
  ajukanBaris,
  ajukanGoodwill,
  materialisasiDariPembatalan,
  type AjukanBarisInput,
  type AjukanBarisResult,
  type AjukanGoodwillInput,
  type AjukanGoodwillResult,
} from "./request";
import { setujuiPengembalian, type SetujuiResult } from "./approve";
import { isiRekeningAdmin, isiRekeningPemesan, type IsiRekeningResult, type RekeningInput } from "./rekening";
import type { PihakBersalah } from "./schema";
import { terbitkanBuktiPengembalianDana, type TerbitkanBuktiInput, type TerbitkanBuktiResult } from "./transfer";
import { tickRefunds, type TickResult } from "./trigger";
import {
  buktiByLink,
  permintaanById,
  permintaanDisetujui,
  permintaanTerbuka,
  permintaanUntukPesanan,
  type BuktiPengembalianDana,
  type PermintaanPengembalian,
} from "./baca";

export { biayaLayananPlatformDikembalikan } from "./aturan";
export { TENGGAT_TRANSFER_HARI_KERJA } from "./approve";
export { rekeningSchema, rekeningTersamar, type RekeningInput } from "./rekening";
export { pihakBersalahKinds, permintaanPengembalianStatuses, permintaanSumberKinds, type PihakBersalah } from "./schema";
export type { AjukanBarisInput, AjukanBarisResult, RefundLine } from "./request";
export type { PermintaanPengembalian } from "./baca";

export interface RefundsDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  files: FileStore;
  lokasi: Pick<Lokasi, "adminPlatformCalendar">;
  billing: Pick<Billing, "within" | "tagihan" | "tagihanMenungguPengembalian">;
  payouts: Pick<Payouts, "batalkanPencairanTagihan" | "kurangiPencairanPesanan" | "sudahDicairkanUntukTagihan" | "catatPotongan">;
  notifications: Pick<Notifications, "pengembalianTerbit">;
  operatorSettings: Pick<OperatorSettings, "current">;
  /** The Bukti Pengembalian Dana page's absolute URL: what the Pemesan is sent and a Potongan links to. */
  buktiUrl: (link: string) => string;
  /** Whether this Akun placed the order (Pemesanan's `orderOf`); the worker, which never handles a Pemesan's write, passes none. */
  pemilikPesanan?: (nomorPemesanan: string, accountId: string) => Promise<boolean>;
  reportError?: ReportError;
}

/** What the document's own page shows: the Bukti, and its transfer proof for a few minutes. */
export type DokumenBuktiPengembalianDana = Omit<BuktiPengembalianDana, "buktiTransferKey"> & { buktiTransferUrl: string | null };

export type AjukanDariPembatalanResult =
  | { ok: true }
  | { ok: false; reason: "tagihan_tidak_ditemukan" | "tidak_ada_yang_dikembalikan" };

/** How long the transfer proof's URL works. */
const BUKTI_TRANSFER_URL_DETIK = 5 * 60;

export interface Refunds {
  /** Worker tick: materialises every Tagihan Billing flagged for a refund into a request here. Idempotent. */
  tick(now?: Date): Promise<TickResult>;
  /**
   * A cancelled, paid Tagihan becomes a refund request naming who is at fault;
   * the amount follows the fee rule. The entry for a caller whose cancellation
   * is not the Pemesan's (Terlambat, Berhenti); the tick does a Pemesan's own.
   */
  ajukanDariPembatalan(tagihanId: string, input: { pihakBersalah: PihakBersalah }): Promise<AjukanDariPembatalanResult>;
  /** Admin Platform raises a goodwill refund on any Tagihan, from the Operator's own funds, never netted. */
  ajukanGoodwill(by: Actor, input: AjukanGoodwillInput): Promise<AjukanGoodwillResult>;
  /** Admin Platform approves a request: the Tier 3 "refund transfer" row appears with its 2 Hari Kerja deadline. */
  setujuiPengembalian(by: Actor, input: { permintaanId: string }): Promise<SetujuiResult>;
  /** The Pemesan of the order enters the refund's destination bank account, until Admin Platform approves it. Audited. */
  isiRekeningPemesan(by: Actor, input: { nomorPemesanan: string; rekening: RekeningInput }): Promise<IsiRekeningResult>;
  /** Admin Platform records or changes the bank account, before or after approval, with a reason. Audited. */
  isiRekeningAdmin(by: Actor, input: { permintaanId: string; rekening: RekeningInput; alasan: string }): Promise<IsiRekeningResult>;
  /** Admin Platform transfers by hand, uploads the proof and enters the date: issues one Bukti Pengembalian Dana. */
  terbitkanBuktiPengembalianDana(by: Actor, input: TerbitkanBuktiInput): Promise<TerbitkanBuktiResult>;
  /** Every open request (diajukan or disetujui), oldest first. */
  permintaanTerbuka(): Promise<PermintaanPengembalian[]>;
  /** One request by id, or null. */
  permintaan(id: string): Promise<PermintaanPengembalian | null>;
  /** The open request on one order, or null: what the Pemesan's own order page offers the bank-account form for. */
  permintaanUntukPesanan(nomorPemesanan: string): Promise<PermintaanPengembalian | null>;
  /** The Antrean's Tier 3 "refund transfer" row's own query: every approved request, with its deadline. */
  pengembalianJatuhTempo(): Promise<PermintaanPengembalian[]>;
  /** The Bukti Pengembalian Dana behind an unguessable link, with its transfer proof as a short-lived signed URL, or null. */
  buktiPengembalianDana(link: string): Promise<DokumenBuktiPengembalianDana | null>;
  /**
   * A refund request for some lines of a paid Tagihan (an order cancelled one
   * item at a time: a Layanan job). The caller names the lines and who is at
   * fault; the Biaya Layanan Platform follows the fee rule, once per Tagihan.
   * Approval, transfer and the Bukti are the same flow as any other request.
   */
  ajukanBaris(tagihanId: string, input: AjukanBarisInput, within?: Database): Promise<AjukanBarisResult>;
}

export function createRefunds(deps: RefundsDeps): Refunds {
  const approveDeps = { db: deps.db, clock: deps.clock, audit: deps.audit, lokasi: deps.lokasi };
  const requestDeps = { db: deps.db, clock: deps.clock, audit: deps.audit };
  const rekeningDeps = {
    db: deps.db,
    clock: deps.clock,
    audit: deps.audit,
    pemilikPesanan: deps.pemilikPesanan ?? (async () => false),
  };
  const transferDeps = {
    db: deps.db,
    clock: deps.clock,
    audit: deps.audit,
    files: deps.files,
    operatorSettings: deps.operatorSettings,
    billing: deps.billing,
    payouts: deps.payouts,
    notifications: deps.notifications,
    buktiUrl: deps.buktiUrl,
    reportError: deps.reportError,
  };
  return {
    tick: (now) => tickRefunds({ db: deps.db, billing: deps.billing }, now ?? deps.clock.now()),
    ajukanDariPembatalan: async (tagihanId, input) => {
      const tagihan = await deps.billing.tagihan(tagihanId);
      if (!tagihan) return { ok: false, reason: "tagihan_tidak_ditemukan" };
      const raised = await materialisasiDariPembatalan(deps.db, deps.clock.now(), tagihan, input.pihakBersalah);
      return raised ? { ok: true } : { ok: false, reason: "tidak_ada_yang_dikembalikan" };
    },
    ajukanGoodwill: (by, input) => ajukanGoodwill(requestDeps, by, input),
    setujuiPengembalian: (by, input) => setujuiPengembalian(approveDeps, by, input),
    isiRekeningPemesan: (by, input) => isiRekeningPemesan(rekeningDeps, by, input),
    isiRekeningAdmin: (by, input) => isiRekeningAdmin(rekeningDeps, by, input),
    terbitkanBuktiPengembalianDana: (by, input) => terbitkanBuktiPengembalianDana(transferDeps, by, input),
    // `within` is the caller's open transaction: the request and what the caller writes commit together.
    ajukanBaris: (tagihanId, input, within) =>
      ajukanBaris(
        { db: within ?? deps.db, clock: deps.clock, billing: within ? deps.billing.within(within) : deps.billing },
        tagihanId,
        input,
      ),
    permintaanTerbuka: () => permintaanTerbuka(deps.db),
    permintaan: (id) => permintaanById(deps.db, id),
    permintaanUntukPesanan: (nomor) => permintaanUntukPesanan(deps.db, nomor),
    pengembalianJatuhTempo: () => permintaanDisetujui(deps.db),
    buktiPengembalianDana: async (link) => {
      const bukti = await buktiByLink(deps.db, link);
      if (!bukti) return null;
      const { buktiTransferKey, ...terbuka } = bukti;
      const buktiTransferUrl = await deps.files.signedUrl(buktiTransferKey, { expiresInSeconds: BUKTI_TRANSFER_URL_DETIK }).catch(() => null);
      return { ...terbuka, buktiTransferUrl };
    },
  };
}
