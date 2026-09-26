import { asc, eq, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { Rupiah } from "@/lib/rupiah";
import type { PdfRenderer } from "@/ports/pdf-renderer";
import { nextDocumentNumber } from "./numbering";
import { buktiPembayaran, tagihan as tagihanTable } from "./schema";
import {
  currentHeader,
  newDocumentLink,
  noHeader,
  readTagihan,
  refusable,
  tagihanByLink,
  type DocumentHeader,
  type Tagihan,
  type TagihanDeps,
  type TagihanStatus,
} from "./tagihan";

/**
 * How a Tagihan was paid, as its Bukti Pembayaran reads:
 * - `penyedia_pembayaran`: through the PaymentProvider (SumoPod), with the channel paid on (e.g. "QRIS", "VA BCA");
 * - `transfer_manual` / `tunai`: recorded by Admin Platform with proof;
 * - `langsung_ke_lokasi`: paid directly to the Lokasi Mitra ("diterima oleh Lokasi Mitra X");
 * - `tanpa_pembayaran`: a Rp 0 Tagihan after a Harga Khusus ("Tanpa pembayaran (Harga Khusus)").
 */
export type PaymentMethod =
  | { kind: "penyedia_pembayaran"; channel: string }
  | { kind: "transfer_manual" }
  | { kind: "tunai" }
  | { kind: "langsung_ke_lokasi"; lokasiName: string }
  | { kind: "tanpa_pembayaran" };

const paymentMethodSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("penyedia_pembayaran"), channel: z.string().trim().min(1).max(100) }),
  z.object({ kind: z.literal("transfer_manual") }),
  z.object({ kind: z.literal("tunai") }),
  z.object({ kind: z.literal("langsung_ke_lokasi"), lokasiName: z.string().trim().min(1).max(300) }),
  z.object({ kind: z.literal("tanpa_pembayaran") }),
]);

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
}

export type RecordPaymentResult =
  | { ok: true; bukti: BuktiPembayaran }
  | { ok: false; reason: "tidak_ditemukan" }
  /** A Dibatalkan Tagihan (lapsed or replaced) can no longer be paid. */
  | { ok: false; reason: "tagihan_dibatalkan" }
  | { ok: false; reason: "baris_tidak_valid" }
  | typeof noHeader;

/** A Tagihan still waiting for its money: Lewat Jatuh Tempo and Tidak Tertagih stay payable. */
const PAYABLE: readonly TagihanStatus[] = ["belum_dibayar", "lewat_jatuh_tempo", "tidak_tertagih"];

/**
 * Records the payment of a Tagihan at `now`: it becomes Lunas and gets exactly
 * one Bukti Pembayaran (numbered BYR/…, headed with the Operator's values now
 * in force). Recording it again returns the same Bukti. The payment paths
 * (provider webhook, manual, direct, Rp 0) and their downstream effects build
 * on this.
 */
export async function recordPayment(
  deps: TagihanDeps,
  tagihanId: string,
  input: RecordPaymentInput,
  now: Date,
): Promise<RecordPaymentResult> {
  const method = paymentMethodSchema.safeParse(input.method);
  if (!method.success) return { ok: false, reason: "baris_tidak_valid" };
  if (!z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tidak_ditemukan" };
  const header = await currentHeader(deps);
  if (!header) return noHeader;
  const buktiId = await refusable(deps.db, async (tx) => {
    const [row] = await tx.select().from(tagihanTable).where(eq(tagihanTable.id, tagihanId)).for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.status === "lunas") {
      const [existing] = await tx
        .select({ id: buktiPembayaran.id })
        .from(buktiPembayaran)
        .where(eq(buktiPembayaran.tagihanId, row.id))
        .orderBy(asc(buktiPembayaran.paidAt))
        .limit(1);
      return { ok: true as const, id: existing.id };
    }
    if (!PAYABLE.includes(row.status)) return { ok: false as const, reason: "tagihan_dibatalkan" as const };
    await tx.update(tagihanTable).set({ status: "lunas", paidAt: now }).where(eq(tagihanTable.id, row.id));
    const [bukti] = await tx
      .insert(buktiPembayaran)
      .values({
        nomor: await nextDocumentNumber(tx, "BYR", now),
        link: newDocumentLink(),
        tagihanId: row.id,
        paidAt: now,
        amount: row.total,
        method: method.data,
        reference: input.reference?.trim() || null,
        header,
      })
      .returning({ id: buktiPembayaran.id });
    return { ok: true as const, id: bukti.id };
  });
  if (!buktiId.ok) return buktiId;
  const bukti = await readBukti(deps.db, eq(buktiPembayaran.id, buktiId.id));
  if (!bukti) throw new Error("Bukti Pembayaran not found");
  return { ok: true, bukti };
}

const headerSchema = z.object({ legalName: z.string(), address: z.string(), phone: z.string(), email: z.string() });

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
export type BillingDocument = { type: "tagihan"; tagihan: Tagihan } | { type: "bukti_pembayaran"; bukti: BuktiPembayaran };

/** A link as issued: 256 bits in unpadded base64url. Anything else finds nothing without a lookup. */
const linkSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** The document behind an unguessable link, or null. */
export async function documentByLink(db: Database, link: string): Promise<BillingDocument | null> {
  if (!linkSchema.safeParse(link).success) return null;
  const tagihan = await tagihanByLink(db, link);
  if (tagihan) return { type: "tagihan", tagihan };
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
): Promise<DocumentPdf | null> {
  const document = await documentByLink(deps.db, link);
  if (!document) return null;
  const number = document.type === "tagihan" ? document.tagihan.nomorTagihan : document.bukti.nomorBukti;
  const bytes = await deps.pdf.render({ url: deps.documentPageUrl(link) });
  return { fileName: `${number.replaceAll("/", "-")}.pdf`, bytes };
}
