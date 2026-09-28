/**
 * Internal to the Billing module: what issuing a Tagihan and recording its
 * payment share (the Operator header, document links, payment methods).
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { PaymentMoment } from "./due-rules";

/** The Operator's header on a document: Pengaturan Operator's values in force when it was issued. */
export interface DocumentHeader {
  legalName: string;
  address: string;
  phone: string;
  email: string;
}

export const headerSchema = z.object({ legalName: z.string(), address: z.string(), phone: z.string(), email: z.string() });

/**
 * A document's link as issued: 256 random bits in unpadded base64url (43
 * characters). Pages and routes check a link against it before any lookup.
 */
export const documentLinkSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

/** A new unguessable document link. */
export const newDocumentLink = () => randomBytes(32).toString("base64url");

export const noHeader = { ok: false, reason: "pengaturan_operator_belum_diisi" } as const;

const instant = z.coerce.date();

/**
 * A payment moment as the `tagihan.moment` column keeps it: the dates of the
 * stored JSON are strings, so every reader parses the column through this (the
 * moment is the one place Billing re-derives a due date from).
 */
export const storedMomentSchema = z.intersection(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("saat_duka"), burialAt: instant, paymentWindowHours: z.number().int().min(1).max(24 * 30) }),
    z.object({ kind: z.literal("pemakaman_hak_pakai_ada"), burialAt: instant }),
    z.object({ kind: z.literal("terencana"), holdExpiresAt: instant }),
    z.object({ kind: z.literal("perpanjangan") }),
    z.object({ kind: z.literal("pengurusan_berkas") }),
    z.object({ kind: z.literal("layanan") }),
    z.object({ kind: z.literal("paket_cycle"), cycleDate: z.iso.date() }),
  ]),
  z.object({ anchorAt: instant }),
);
export type StoredMoment = PaymentMoment & { anchorAt: Date };

/** The stored moment as the pure due rules read it, with its dates as instants. */
export function momentOf(column: unknown): StoredMoment {
  return storedMomentSchema.parse(column) as StoredMoment;
}

// The payment cap and its one test live in ./batas, which a client component may
// import; they are the same rule, re-exported here where Billing keeps the rest.
export { QRIS_PAYMENT_CAP, withinPaymentCap } from "./batas";

/**
 * The Operator's header values now in force, read before an issuing
 * transaction opens (so an issue never holds its connection while waiting for
 * another), or null before Admin Platform has entered Pengaturan Operator.
 */
export async function currentHeader(operatorSettings: Pick<OperatorSettings, "current">): Promise<DocumentHeader | null> {
  const settings = await operatorSettings.current();
  return settings && { legalName: settings.legalName, address: settings.address, phone: settings.phone, email: settings.email };
}

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

export const paymentMethodSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("penyedia_pembayaran"), channel: z.string().trim().min(1).max(100) }),
  z.object({ kind: z.literal("transfer_manual") }),
  z.object({ kind: z.literal("tunai") }),
  z.object({ kind: z.literal("langsung_ke_lokasi"), lokasiName: z.string().trim().min(1).max(300) }),
  z.object({ kind: z.literal("tanpa_pembayaran") }),
]);
