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
import type { AuditLog } from "@/domain/audit";
import type { Actor } from "@/domain/identity";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import type { PaymentProvider, WebhookRequest } from "@/ports/payment-provider";
import type { PdfRenderer } from "@/ports/pdf-renderer";
import {
  documentByLink,
  documentPdf,
  recordPayment,
  type BillingDocument,
  type DocumentPdf,
  type RecordPaymentInput,
  type RecordPaymentInResult,
} from "./documents";
import { nextDocumentNumber, nextNomorPemesanan, type DocumentType } from "./numbering";
import {
  bayar,
  listPembayaranPerluDitinjau,
  receivePaymentWebhook,
  type BayarResult,
  type PaymentWebhookResult,
  type PembayaranPerluDitinjau,
} from "./payment";
import { catatPembayaranManual, urlBukti, type CatatPembayaranManualResult } from "./pembayaran-manual";
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
export type { BillingDocument, BuktiPembayaran, DocumentPdf, RecordPaymentInput, RecordPaymentInResult, RecordPaymentResult } from "./documents";
export type { CatatPembayaranManualResult, PembayaranManualInput } from "./pembayaran-manual";
export { BUKTI_PEMBAYARAN_MAX_BYTES, BUKTI_URL_SECONDS, pembayaranManualSchema } from "./pembayaran-manual";
export { documentLinkSchema, QRIS_PAYMENT_CAP, withinPaymentCap, type DocumentHeader, type PaymentMethod } from "./shared";
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
  /** The private FileStore the proof of a payment outside the PaymentProvider is kept in. */
  files: FileStore;
  /** Every staff write on a payment (a manual one) records an Entri Audit here. */
  audit: AuditLog;
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
   * Records the payment of a Tagihan: Lunas, with exactly one Bukti Pembayaran
   * (recording it again returns the same one, with `settled` false). A Dibatalkan Tagihan can't be
   * paid; Lewat Jatuh Tempo and Tidak Tertagih stay payable.
   *
   * On a `within(tx)` Billing it settles inside that transaction, which is how the module that
   * owns an order records a payment and the order's own state of it in one commit.
   */
  recordPayment(tagihanId: string, input: RecordPaymentInput): Promise<RecordPaymentInResult>;
  /**
   * Admin Platform records a Tagihan paid by hand — Transfer manual or Tunai —
   * with an uploaded proof: Lunas, with exactly one Bukti Pembayaran whose
   * method reads that method, and the same downstream effects a provider
   * payment fires, in the transaction the Entri Audit is recorded in. The
   * proof is required; a Tagihan that is Lunas, Dibatalkan or past its payment
   * limit is refused before the file is stored.
   */
  catatPembayaranManual(by: Actor, input: unknown): Promise<CatatPembayaranManualResult>;
  /**
   * A short-lived signed URL for the proof of a Tagihan's payment (Admin
   * Platform only), or null-ish: `tanpa_lampiran` for a provider payment and a
   * Rp 0 Tagihan, which have no money to prove.
   */
  urlBukti(by: Actor, tagihanId: string): Promise<Awaited<ReturnType<typeof urlBukti>>>;
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
    recordPayment: (tagihanId, input) => recordPayment(deps, tagihanId, input, deps.clock.now()),
    catatPembayaranManual: (by, input) => catatPembayaranManual(deps, by, input, deps.clock.now()),
    urlBukti: (by, tagihanId) => urlBukti(deps, by, tagihanId),
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
