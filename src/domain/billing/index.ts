/**
 * Billing (spec, domain module 10): Tagihan, Bukti Pembayaran, document
 * numbering and the document pages; refunds and Bukti Pengembalian Dana come
 * with their tickets.
 *
 * A Tagihan is one per payment moment and immutable once issued: a change is a
 * cancel-and-reissue with a new Nomor Tagihan. Its kind (pay-first or
 * pay-after) and its one due date come from `tagihanDue`, the one pure rule.
 *
 * Owns tables: tagihan, tagihan_line, bukti_pembayaran, billing_document_counter,
 * provider_payment, payment_webhook_event, payment_effect_failure.
 *
 * Billing is called by the modules that own the orders (Pemesanan,
 * Perpanjangan, Pengurusan, Layanan), never by an actor directly: those check
 * who may act and record any Entri Audit. Two exceptions face the outside
 * directly: Bayar (anyone holding a Tagihan's link may pay) and the
 * PaymentProvider's webhook (authenticated by its signature).
 */
import type { Database } from "@/db/client";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { Clock } from "@/ports/clock";
import type { PaymentProvider, WebhookRequest } from "@/ports/payment-provider";
import type { PdfRenderer } from "@/ports/pdf-renderer";
import {
  documentByLink,
  documentPdf,
  recordPayment,
  type BillingDocument,
  type DocumentPdf,
  type RecordPaymentInput,
  type RecordPaymentResult,
} from "./documents";
import { nextDocumentNumber, nextNomorPemesanan, type DocumentType } from "./numbering";
import { batalkanTagihan, type BatalkanTagihanAlasan, type BatalkanTagihanResult } from "./batalkan-tagihan";
import {
  bayar,
  listPembayaranPerluDitinjau,
  receivePaymentWebhook,
  type BayarResult,
  type PaymentWebhookResult,
  type PembayaranPerluDitinjau,
} from "./payment";
import { retryFailedPaymentEffects, type PaymentEffect } from "./settlement";
import type { ReportError } from "@/lib/observability/report-error";
import {
  issueTagihan,
  lapseDuePayFirstTagihan,
  readTagihan,
  reissueTagihan,
  type IssueTagihanInput,
  type IssueTagihanResult,
  type NewTagihanLine,
  type ReissueTagihanResult,
  type Tagihan,
} from "./tagihan";

export type { DocumentType } from "./numbering";
export type { PaymentEffect, SettledPayment } from "./settlement";
export type { NotPayable } from "./settlement";
export type { BayarResult, PaymentWebhookResult, PembayaranPerluDitinjau, WebhookReviewReason } from "./payment";
export type { BillingDocument, BuktiPembayaran, DocumentPdf, RecordPaymentInput, RecordPaymentResult } from "./documents";
export {
  currentHeader,
  documentLinkSchema,
  newDocumentLink,
  noHeader,
  paymentMethodSchema,
  QRIS_PAYMENT_CAP,
  withinPaymentCap,
  type DocumentHeader,
  type PaymentMethod,
} from "./shared";
export type { BatalkanTagihanAlasan, BatalkanTagihanResult, PermintaanPengembalian } from "./batalkan-tagihan";
export { tagihanDue, type DueLine, type PaymentMoment, type TagihanDue, type TagihanKind } from "./due-rules";
export {
  PENYESUAIAN_HARGA_KHUSUS,
  TARIFF_LINE_KINDS,
  type IssueRefusal,
  type IssueTagihanInput,
  type IssueTagihanResult,
  type LineProvider,
  type NewTagihanLine,
  type ReissueTagihanResult,
  type Tagihan,
  type TagihanLine,
  type TagihanStatus,
  type TariffLineKind,
} from "./tagihan";

export interface BillingDeps {
  db: Database;
  clock: Clock;
  /** Every document is headed with the Operator's values in force when it is issued. */
  operatorSettings: Pick<OperatorSettings, "current">;
  pdf: PdfRenderer;
  /** The absolute URL of a document's page (from its link), which the PdfRenderer opens. */
  documentPageUrl: (link: string) => string;
  payments: PaymentProvider;
  /** The public URL of a document's page (from its link): where the PaymentProvider sends the payer back to. */
  publicDocumentUrl: (link: string) => string;
  /** The downstream effects of a payment, registered by the modules that own them. */
  paymentEffects?: readonly PaymentEffect[];
  /** Where Billing reports what needs a human (a failed downstream effect, an odd webhook). */
  reportError?: ReportError;
}

export interface Billing {
  /** Issues a Tagihan for a payment moment: Belum Dibayar, numbered, due per `tagihanDue`, with its own document link. */
  issueTagihan(input: IssueTagihanInput): Promise<IssueTagihanResult>;
  /** Cancels an unpaid Tagihan and issues its replacement with new lines and a new Nomor Tagihan (never an edit). */
  reissueTagihan(tagihanId: string, input: { lines: NewTagihanLine[] }): Promise<ReissueTagihanResult>;
  /** One Tagihan as issued, or null. */
  tagihan(tagihanId: string): Promise<Tagihan | null>;
  /**
   * Cancels one Tagihan because the order it was for will not happen, and in the
   * same transaction records the refund of any payment it had, less the Biaya
   * Layanan Platform (ticket 24). What the refund is paid out through is ticket
   * 31's; that it is *asked for* is part of cancelling the bill.
   */
  batalkanTagihan(tagihanId: string, input: { alasan: BatalkanTagihanAlasan }): Promise<BatalkanTagihanResult>;
  /**
   * Records the payment of a Tagihan: Lunas, with exactly one Bukti Pembayaran
   * (recording it again returns the same one). A Dibatalkan Tagihan can't be
   * paid; Lewat Jatuh Tempo and Tidak Tertagih stay payable.
   */
  recordPayment(tagihanId: string, input: RecordPaymentInput): Promise<RecordPaymentResult>;
  /**
   * Bayar on a Tagihan's page (anyone with its link): the PaymentProvider's
   * payment page for it, created on the first click and reused while its link
   * is valid, created anew once it expired.
   */
  bayar(link: string): Promise<BayarResult>;
  /**
   * A PaymentProvider webhook (the raw body and headers as received): rejected
   * unless its signature checks out, then processed exactly once per event. A
   * "paid" event for a payment made through Bayar makes the Tagihan Lunas with
   * one Bukti Pembayaran and fires the downstream effects, all in one
   * transaction. Money it cannot settle a Tagihan with is reported, not lost.
   */
  receivePaymentWebhook(request: WebhookRequest): Promise<PaymentWebhookResult>;
  /**
   * Every Pembayaran Perlu Ditinjau, oldest first: money the PaymentProvider
   * reported as paid that Billing could not settle a Tagihan with.
   */
  pembayaranPerluDitinjau(): Promise<PembayaranPerluDitinjau[]>;
  /** The Tagihan or Bukti Pembayaran behind an unguessable link, or null. */
  documentByLink(link: string): Promise<BillingDocument | null>;
  /** "Unduh PDF": the document's page rendered through the PdfRenderer, or null for an unknown link. */
  documentPdf(link: string): Promise<DocumentPdf | null>;
  /**
   * The next number of a document type in this year (WIB), e.g. `BPM/2026/000123`,
   * for the modules that issue Bukti Pemesanan, Bukti Perpanjangan, Bukti
   * Pengembalian Dana and Bukti Pencairan. Take it `within` the transaction
   * that issues the document, so a rollback gives it back.
   */
  nextDocumentNumber(type: DocumentType): Promise<string>;
  /** The next Nomor Pemesanan, `MKM-2026-000123`: one series for every order kind. Take it `within` the order's transaction. */
  nextNomorPemesanan(): Promise<string>;
  /** The same functions inside an open transaction (another module's), committing or rolling back with it. */
  within(tx: Database): Billing;
}

/**
 * Scheduler tick: every pay-first Tagihan still Belum Dibayar at its due date
 * lapses to Dibatalkan ("batas pembayaran lewat"). Pay-after Tagihan are never
 * lapsed. Idempotent.
 */
export async function lapsePayFirstTagihanTick(ctx: { db: Database }, now: Date): Promise<void> {
  await lapseDuePayFirstTagihan(ctx.db, now);
}

/**
 * Scheduler tick: runs again every downstream effect of a payment that failed
 * (the payment itself stood), each in its own transaction, with the effect
 * registry the worker is composed with. Idempotent: a resolved failure is left
 * alone, and effects are idempotent themselves.
 */
export async function retryFailedPaymentEffectsTick(
  ctx: { db: Database; paymentEffects: readonly PaymentEffect[]; reportError: ReportError },
  now: Date,
): Promise<void> {
  await retryFailedPaymentEffects(ctx.db, ctx, now);
}

export function createBilling(deps: BillingDeps): Billing {
  return {
    issueTagihan: (input) => issueTagihan(deps, input, deps.clock.now()),
    reissueTagihan: (tagihanId, input) => reissueTagihan(deps, tagihanId, input, deps.clock.now()),
    tagihan: (tagihanId) => readTagihan(deps.db, tagihanId),
    batalkanTagihan: (tagihanId, input) => batalkanTagihan(deps, tagihanId, input, deps.clock.now()),
    recordPayment: (tagihanId, input) => recordPayment(deps, tagihanId, input, deps.clock.now()),
    bayar: (link) => bayar(deps, link, deps.clock.now()),
    receivePaymentWebhook: (request) => receivePaymentWebhook(deps, request, deps.clock.now()),
    pembayaranPerluDitinjau: () => listPembayaranPerluDitinjau(deps.db),
    documentByLink: (link) => documentByLink(deps.db, link, deps.clock.now()),
    documentPdf: (link) => documentPdf(deps, link, deps.clock.now()),
    nextDocumentNumber: (type) => nextDocumentNumber(deps.db, type, deps.clock.now()),
    nextNomorPemesanan: () => nextNomorPemesanan(deps.db, deps.clock.now()),
    within: (tx) => createBilling({ ...deps, db: tx }),
  };
}
