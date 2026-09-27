/**
 * A Tagihan paid by hand (spec, Billing > Payment: "manual (Transfer manual /
 * Tunai by Admin Platform with proof)"; ticket 30's AC 1). Money that never
 * reaches the PaymentProvider: Admin Platform enters what arrived, uploads the
 * slip or the receipt, and Billing does the same settling every other payment
 * path does — Lunas, one Bukti Pembayaran numbered BYR/…, the downstream
 * effects fired once — in the transaction the Entri Audit is recorded in.
 *
 * The proof is not a nicety: without a file the action does not exist, so "it
 * was paid" is never a claim with nothing behind it. It is kept in the private
 * FileStore, and only Admin Platform can read it back (through `urlBukti`, a
 * short-lived signed URL): a payment slip is the family's own.
 *
 * The other two payment paths are elsewhere, each on the module that owns its
 * order: "Dibayar langsung ke Lokasi Mitra" is recorded by the Admin Lokasi
 * (Pemesanan, `catatPembayaranLangsung`, which also writes what Pencairan must
 * not pay for), and the Rp 0 waiver is a consequence of a Harga Khusus at issue
 * (`issueTagihan`).
 */
import { randomUUID } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { tagihanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import { wib } from "@/lib/time/jakarta";
import type { FileStore } from "@/ports/file-store";
import { buktiPembayaran, tagihan as tagihanTable } from "./schema";
import { notPayableBecause } from "./settlement";
import { recordPaymentIn, type BuktiPembayaran, type CatatPembayaranManualDeps } from "./documents";

/** A payment proof is a photo of a paper or a scan of it, as every other upload here is. */
const BUKTI_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** The largest proof accepted, 10 MB (the same ceiling as every other staff upload). */
export const BUKTI_PEMBAYARAN_MAX_BYTES = 10 * 1024 * 1024;

/** How long a proof's signed URL works, for the one staff member allowed to read it. */
export const BUKTI_URL_SECONDS = 5 * 60;

/** A WIB wall clock as a form holds it ("2026-10-02T14:00"), never an instant: a time zone belongs to the form. */
const wallClock = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/);

export const pembayaranManualSchema = z.object({
  tagihanId: z.uuid(),
  /** How the money arrived: a transfer to the Operator, or cash over the counter. */
  metode: z.enum(["transfer_manual", "tunai"]),
  /** The transfer's or the receipt's reference, when the slip shows one. */
  referensi: z.string().trim().max(120).optional(),
  /** When the money was paid, as the slip shows it; the Clock's now when left out. */
  dibayarPada: wallClock.optional(),
  /** The proof, and it is not optional: a payment without one is not recorded. */
  bukti: z.object({
    body: z.custom<Uint8Array>((value) => value instanceof Uint8Array && value.byteLength > 0),
    contentType: z.string().trim().min(1).max(100),
  }),
});
export type PembayaranManualInput = z.input<typeof pembayaranManualSchema>;

export type CatatPembayaranManualResult =
  | { ok: true; bukti: BuktiPembayaran }
  | WriteRefusal
  | {
      ok: false;
      /** No proof, an unknown or malformed field, or a wall clock that is not one. */
      reason: "input_tidak_valid";
    }
  /** No Tagihan of that id. */
  | { ok: false; reason: "tagihan_tidak_ditemukan" }
  /** The Tagihan is Lunas already: this slip is not a second payment, and it is not stored. */
  | { ok: false; reason: "pembayaran_sudah_ada" }
  /** Dibatalkan (lapsed or replaced), or paid at or after a pay-first Tagihan's due date. */
  | { ok: false; reason: "tagihan_dibatalkan" | "batas_pembayaran_lewat" }
  /** The payment time is not a time, or is in the future. */
  | { ok: false; reason: "waktu_pembayaran_tidak_valid" }
  /** The file is of a kind nothing here accepts, or over 10 MB. */
  | { ok: false; reason: "bukti_tidak_didukung" }
  /** The FileStore refused the upload (or is not configured). */
  | { ok: false; reason: "penyimpanan_belum_tersedia" }
  /** No Pengaturan Operator, so no Bukti Pembayaran can be issued. */
  | { ok: false; reason: "pengaturan_operator_belum_diisi" };

/**
 * Admin Platform records a Tagihan paid by hand, with its proof. The whole of
 * it in one transaction: the Tagihan becomes Lunas, the one Bukti Pembayaran is
 * numbered and keeps the proof, the downstream effects fire, and the Entri Audit
 * is recorded — a write that recorded no entry is not kept.
 */
export async function catatPembayaranManual(
  deps: CatatPembayaranManualDeps,
  by: Actor,
  rawInput: unknown,
  now: Date,
): Promise<CatatPembayaranManualResult> {
  const parsed = pembayaranManualSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  // The Tagihan names what is being paid, so the check can be made against it.
  // A bad id never reaches the database, let alone a file upload.
  if (!z.uuid().safeParse(input.tagihanId).success) return { ok: false, reason: "tagihan_tidak_ditemukan" };
  const [row] = await deps.db.select().from(tagihanTable).where(eq(tagihanTable.id, input.tagihanId));
  if (!row) return { ok: false, reason: "tagihan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pembayaran.catat_manual", tagihanResource(row.id));
  if (refusal) return refusal;
  // A Tagihan that can no longer be paid is refused before the upload, so a slip is never
  // stored for a payment this action already knows did not happen. (A payment that lands between
  // this check and the settle below is the one case that leaves a file behind: the refusal says
  // so, and the Entri Audit of the payment that won says whose it was.)
  const notPayable = notPayableBecause(row, now);
  if (notPayable === "sudah_lunas") return { ok: false, reason: "pembayaran_sudah_ada" };
  if (notPayable) return { ok: false, reason: notPayable };
  const paidAt = input.dibayarPada === undefined ? now : safeWallClock(input.dibayarPada);
  if (!paidAt) return { ok: false, reason: "input_tidak_valid" };
  if (paidAt > now) return { ok: false, reason: "waktu_pembayaran_tidak_valid" };
  const extension = documentExtension(input.bukti, BUKTI_TYPES);
  if (!extension || input.bukti.body.byteLength > BUKTI_PEMBAYARAN_MAX_BYTES) return { ok: false, reason: "bukti_tidak_didukung" };

  const key = `bukti-pembayaran/${row.id}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.bukti.body, contentType: input.bukti.contentType });
  } catch {
    return { ok: false, reason: "penyimpanan_belum_tersedia" };
  }
  const hasil = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const settled = await recordPaymentIn(
      tx,
      deps,
      row.id,
      { method: { kind: input.metode }, reference: input.referensi ?? null, paidAt, proofKey: key },
      now,
    );
    if (!settled.ok) {
      // `tidak_ditemukan` cannot happen (the Tagihan was read a moment ago) and `baris_tidak_valid`
      // cannot either (the method is one of the two this action offers). If either ever is, the input
      // is what is wrong, which is the truth the caller needs either way.
      if (settled.reason === "tidak_ditemukan") return { ok: false as const, reason: "tagihan_tidak_ditemukan" as const };
      if (settled.reason === "baris_tidak_valid") return { ok: false as const, reason: "input_tidak_valid" as const };
      return settled;
    }
    if (!settled.settled) return { ok: false as const, reason: "pembayaran_sudah_ada" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pembayaran.catat_manual",
      entity: { kind: "tagihan", id: row.id },
      before: { status: row.status },
      after: {
        status: "lunas",
        nomorBukti: settled.bukti.nomorBukti,
        metode: input.metode,
        nominal: settled.bukti.amount,
        dibayarPada: paidAt.toISOString(),
        referensi: input.referensi ?? null,
      },
      reason: null,
    });
    return { ok: true as const, bukti: settled.bukti };
  });
  return hasil;
}

/** A short-lived URL for the proof of a Tagihan's payment, or null when it has none. */
export async function urlBukti(
  deps: { db: Database; files: FileStore },
  by: Actor,
  tagihanId: string,
): Promise<{ ok: true; url: string } | WriteRefusal | { ok: false; reason: "tagihan_tidak_ditemukan" | "tanpa_lampiran" }> {
  if (!z.uuid().safeParse(tagihanId).success) return { ok: false, reason: "tagihan_tidak_ditemukan" };
  const [row] = await deps.db.select().from(tagihanTable).where(eq(tagihanTable.id, tagihanId));
  if (!row) return { ok: false, reason: "tagihan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pembayaran.lihat_bukti", tagihanResource(row.id));
  if (refusal) return refusal;
  const [bukti] = await deps.db
    .select({ proofKey: buktiPembayaran.proofKey })
    .from(buktiPembayaran)
    .where(eq(buktiPembayaran.tagihanId, row.id))
    .orderBy(asc(buktiPembayaran.paidAt))
    .limit(1);
  if (!bukti) return { ok: false, reason: "tagihan_tidak_ditemukan" };
  if (!bukti.proofKey) return { ok: false, reason: "tanpa_lampiran" };
  return { ok: true, url: await deps.files.signedUrl(bukti.proofKey, { expiresInSeconds: BUKTI_URL_SECONDS }) };
}

/** The WIB instant of a wall clock a form held, or null when it is not one (`wib` throws). */
function safeWallClock(value: string): Date | null {
  try {
    return wib(value);
  } catch {
    return null;
  }
}
