import { asc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { AuditLog } from "@/domain/audit";
import type { Rupiah } from "@/lib/rupiah";
import type { FileStore } from "@/ports/file-store";
import type { PdfRenderer } from "@/ports/pdf-renderer";
import { buktiPembayaran, tagihan } from "./schema";
import { notPayableBecause, settleIn, type NotPayable } from "./settlement";
import {
  currentHeader,
  documentLinkSchema,
  headerSchema,
  noHeader,
  paymentMethodSchema,
  type DocumentHeader,
  type PaymentMethod,
} from "./shared";
import { readTagihan, tagihanByLink, type Tagihan, type TagihanDeps } from "./tagihan";

export interface BuktiPembayaran {
  id: string;
  nomorBukti: string;
  /** The unguessable part of the Bukti Pembayaran page's link. */
  link: string;
  paidAt: Date;
  amount: Rupiah;
  method: PaymentMethod;
  reference: string | null;
  /** The Operator's header values in force when this Bukti was issued. */
  header: DocumentHeader;
  /** The Tagihan it settles (whose lines it repeats), as it stands now. */
  tagihan: Tagihan;
}

export interface RecordPaymentInput {
  method: PaymentMethod;
  reference: string | null;
  /** When the money was paid (e.g. the transfer's time on its proof); not in the future. Default: now. */
  paidAt?: Date;
  /** The private FileStore key of a payment's proof, when it has one. */
  proofKey?: string | null;
}

export type RecordPaymentResult =
  | { ok: true; bukti: BuktiPembayaran }
  | { ok: false; reason: "tidak_ditemukan" }
  /** A Dibatalkan Tagihan (lapsed or replaced) can no longer be paid. */
  | { ok: false; reason: "tagihan_dibatalkan" }
  /** Paid at or after a pay-first Tagihan's due date, when it lapsed (whether or not the lapse tick has run). */
  | { ok: false; reason: "batas_pembayaran_lewat" }
  /** The payment time is not a time, or is in the future. */
  | { ok: false; reason: "waktu_pembayaran_tidak_valid" }
  | { ok: false; reason: "baris_tidak_valid" }
  | typeof noHeader;

/** The deps recording a payment by hand needs: Billing's own, plus the FileStore and the Audit Log. */
export type CatatPembayaranManualDeps = TagihanDeps & { files: FileStore; audit: AuditLog };

/** `recordPayment`'s result, with whether this call is the payment that settled the Tagihan. */
export type RecordPaymentInResult =
  | { ok: true; bukti: BuktiPembayaran; settled: boolean }
  | Exclude<RecordPaymentResult, { ok: true }>;

/**
 * Records the payment of a Tagihan, paid at `input.paidAt` (default `now`):
 * a pay-first Tagihan paid at or after its due date is refused. It becomes Lunas and gets exactly
 * one Bukti Pembayaran (numbered BYR/…, headed with the Operator's values now
 * in force), and its downstream effects fire in the same transaction.
 * Recording it again returns the same Bukti, with `settled` false, so a caller
 * that has to tell the two apart can. The manual and direct payment paths build
 * on this; the provider webhook settles the same way.
 *
 * Called on a `within(tx)` Billing it settles inside that transaction, which is
 * how the module that owns an order records the payment and the order's own
 * state of it in one commit.
 */
export async function recordPayment(
  deps: TagihanDeps,
  tagihanId: string,
  input: RecordPaymentInput,
  now: Date,
): Promise<RecordPaymentInResult> {
  return refusable(deps.db, (tx) => recordPaymentIn(tx, deps, tagihanId, input, now));
}

/**
 * `recordPayment` inside a transaction another module opened: it settles with
 * `tx`, so the payment, its Bukti Pembayaran, its effects and whatever else the
 * caller writes there (a Harga Khusus line on the order, an Entri Audit) commit
 * or roll back together.
 *
 * `settled` is false when the Tagihan was Lunas already: the Bukti returned is
 * then the one that earlier payment produced, not a second one.
 */
export async function recordPaymentIn(
  tx: Database,
  deps: TagihanDeps,
  tagihanId: string,
  input: RecordPaymentInput,
  now: Date,
): Promise<RecordPaymentInResult> {
  const method = paymentMethodSchema.safeParse(input.method);
  if (!method.success) return { ok: false, reason: "baris_tidak_valid" };
  if (!z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tidak_ditemukan" };
  const paidAt = z.date().max(now).safeParse(input.paidAt ?? now);
  if (!paidAt.success) return { ok: false, reason: "waktu_pembayaran_tidak_valid" };
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;
  const reference = input.reference?.trim() || null;
  const settled = await settleIn(
    tx,
    deps,
    tagihanId,
    { method: method.data, reference, header, paidAt: paidAt.data, proofKey: input.proofKey ?? null },
    now,
  );
  if (!settled.ok) return settled;
  return { ok: true, bukti: await buktiById(tx, settled.buktiId), settled: settled.settled };
}

/**
 * The method a Tagihan's payment settled it with, or null while it has none
 * (not Lunas, or no Bukti Pembayaran yet).
 *
 * This is a fact about the payment, not something a caller infers from the
 * total: a Rp 0 Tagihan is Lunas at issue with the method `tanpa_pembayaran`,
 * so **no money ever moved**, which is a different thing from a Tagihan the
 * family paid. Whoever prices what is owed for an order (Payouts) has to be able
 * to tell those apart, so the Bukti Pembayaran's own method is read rather than
 * guessed at.
 */
export async function metodePembayaran(db: Database, tagihanId: string): Promise<PaymentMethod | null> {
  if (!z.uuid().safeParse(tagihanId).success) return null;
  const [row] = await db
    .select({ status: tagihan.status, method: buktiPembayaran.method })
    .from(tagihan)
    .leftJoin(buktiPembayaran, eq(buktiPembayaran.tagihanId, tagihan.id))
    .where(eq(tagihan.id, tagihanId))
    .orderBy(asc(buktiPembayaran.paidAt))
    .limit(1);
  if (!row || row.status !== "lunas" || !row.method) return null;
  return paymentMethodSchema.parse(row.method) as PaymentMethod;
}

/** A Bukti Pembayaran known to exist. */
export async function buktiById(db: Database, buktiId: string): Promise<BuktiPembayaran> {
  const bukti = await readBukti(db, eq(buktiPembayaran.id, buktiId));
  if (!bukti) throw new Error("Bukti Pembayaran not found");
  return bukti;
}

async function readBukti(db: Database, where: SQL): Promise<BuktiPembayaran | null> {
  const [row] = await db.select().from(buktiPembayaran).where(where);
  if (!row) return null;
  const tagihan = await readTagihan(db, row.tagihanId);
  if (!tagihan) throw new Error("Bukti Pembayaran without its Tagihan");
  return {
    id: row.id,
    nomorBukti: row.nomor,
    link: row.link,
    paidAt: row.paidAt,
    amount: row.amount,
    method: paymentMethodSchema.parse(row.method) as PaymentMethod,
    reference: row.reference,
    header: headerSchema.parse(row.header),
    tagihan,
  };
}

/** A document page: what an unguessable link shows. */
export type BillingDocument =
  /** A Tagihan: why Bayar is not offered on it (null while it is), and the link of its Bukti Pembayaran once Lunas. */
  | { type: "tagihan"; tagihan: Tagihan; notPayableBecause: NotPayable | null; buktiLink: string | null }
  | { type: "bukti_pembayaran"; bukti: BuktiPembayaran };

/** The document behind an unguessable link, or null (anything not shaped like a link finds nothing without a lookup). */
export async function documentByLink(db: Database, link: string, now: Date): Promise<BillingDocument | null> {
  if (!documentLinkSchema.safeParse(link).success) return null;
  const tagihan = await tagihanByLink(db, link);
  if (tagihan) {
    const [bukti] = await db
      .select({ link: buktiPembayaran.link })
      .from(buktiPembayaran)
      .where(eq(buktiPembayaran.tagihanId, tagihan.id))
      .orderBy(asc(buktiPembayaran.paidAt))
      .limit(1);
    return { type: "tagihan", tagihan, notPayableBecause: notPayableBecause(tagihan, now), buktiLink: bukti?.link ?? null };
  }
  const bukti = await readBukti(db, eq(buktiPembayaran.link, link));
  return bukti && { type: "bukti_pembayaran", bukti };
}

export interface DocumentPdf {
  /** e.g. "TGH-2026-000123.pdf". */
  fileName: string;
  bytes: Uint8Array;
}

/**
 * "Unduh PDF": the document's own page rendered by the PdfRenderer, named
 * after its number; null for a link that finds no document.
 */
export async function documentPdf(
  deps: { db: Database; pdf: PdfRenderer; documentPageUrl: (link: string) => string },
  link: string,
  now: Date,
): Promise<DocumentPdf | null> {
  const document = await documentByLink(deps.db, link, now);
  if (!document) return null;
  const number = document.type === "tagihan" ? document.tagihan.nomorTagihan : document.bukti.nomorBukti;
  const bytes = await deps.pdf.render({ url: deps.documentPageUrl(link) });
  return { fileName: `${number.replaceAll("/", "-")}.pdf`, bytes };
}
