/**
 * "Dibayar langsung ke Lokasi Mitra" (spec, Billing > Payment: "by the Admin
 * Lokasi with proof, reversible by Admin Platform"; Payouts: "'Dibayar langsung'
 * means no tariff Pencairan and a platform-fee Potongan"; ticket 30's AC 2).
 *
 * The one payment path the money never travels on: a family pays the Lokasi
 * Mitra at its own gate, so nothing reaches the Operator's account. The Admin
 * Lokasi of that Lokasi Mitra records it with a proof, the order's Tagihan
 * settles the way every other payment does (Lunas, one Bukti Pembayaran reading
 * "diterima oleh Lokasi Mitra X", the downstream effects fired once), and the
 * order keeps the fact Pencairan must read — on the order, because this module
 * owns the order and Payouts reads it through `pembayaranOrder`, never from
 * this table.
 *
 * Reversing it is **not** here: "reversible by Admin Platform" is a refund, and a
 * refund is ticket 31 (Bukti Pengembalian Dana, a cancelled Tagihan, the effects
 * already fired). Until that exists nothing may take this record back, which is
 * why it is written once and never changed: the only honest move with a wrong
 * entry is ticket 31's.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { BuktiPembayaran } from "@/domain/billing";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import type { PemesananDeps } from "./deps";
import { pemesananMakam } from "./schema";

/** A Lokasi Mitra's record of the cash it received is a photo of a paper or a scan of it. */
const BAYAR_LANGUNG_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/** The largest record accepted, 10 MB (the same ceiling as every other staff upload). */
export const BAYAR_LANGUNG_MAX_BYTES = 10 * 1024 * 1024;

export const bayarLangsungSchema = z.object({
  nomor: z.string().trim().regex(/^MKM-\d{4}-\d{6}$/),
  /** The Lokasi Mitra's own record of the cash; required, as it is the only evidence there is. */
  bukti: z.object({
    body: z.custom<Uint8Array>((value) => value instanceof Uint8Array && value.byteLength > 0),
    contentType: z.string().trim().min(1).max(100),
  }),
});
export type BayarLangsungInput = z.input<typeof bayarLangsungSchema>;

export type CatatPembayaranLangsungResult =
  | { ok: true; /** The Bukti Pembayaran, whose method names the Lokasi Mitra that received the money. */ pembayaran: BuktiPembayaran }
  | WriteRefusal
  /** No record, or a malformed field. */
  | { ok: false; reason: "input_tidak_valid" }
  /** No order of that Nomor Pemesanan. */
  | { ok: false; reason: "pesanan_tidak_ditemukan" }
  /** The Lokasi has not confirmed the order, so it has no Tagihan to settle. */
  | { ok: false; reason: "tagihan_belum_ada" }
  /** Already recorded, or already Lunas through another payment: the money came in once. */
  | { ok: false; reason: "sudah_ada_bayar_langsung" }
  /** Dibatalkan (lapsed or replaced), or paid at or after a pay-first Tagihan's due date. */
  | { ok: false; reason: "tagihan_dibatalkan" | "batas_pembayaran_lewat" }
  /** The record is of a kind nothing here accepts, or over 10 MB. */
  | { ok: false; reason: "bukti_tidak_didukung" }
  /** The FileStore refused the upload (or is not configured). */
  | { ok: false; reason: "penyimpanan_belum_tersedia" }
  /** No Pengaturan Operator, so no Bukti Pembayaran can be issued. */
  | { ok: false; reason: "pengaturan_operator_belum_diisi" };

/**
 * The Admin Lokasi of that Lokasi Mitra records that a family paid it directly,
 * with the record it kept of the cash. In one transaction: the order's Tagihan
 * is settled as `langsung_ke_lokasi`, the order records the fact Pencairan
 * reads, and the Entri Audit is written — a write that records none is not kept.
 */
export async function catatPembayaranLangsung(
  deps: PemesananDeps,
  by: Actor,
  rawInput: unknown,
): Promise<CatatPembayaranLangsungResult> {
  const parsed = bayarLangsungSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const [order] = await deps.db.select().from(pemesananMakam).where(eq(pemesananMakam.nomor, input.nomor));
  if (!order) return { ok: false, reason: "pesanan_tidak_ditemukan" };
  const refusal = writeRefusal(by, "pembayaran.catat_langsung", lokasiMitraResource(order.lokasiId));
  if (refusal) return refusal;
  if (order.bayarLangsungPada) return { ok: false, reason: "sudah_ada_bayar_langsung" };
  if (!order.tagihanId) return { ok: false, reason: "tagihan_belum_ada" };
  // The Tagihan is Billing's row, read through its own public function: a Tagihan that can no
  // longer be paid is refused here, so a record is never stored for a payment that did not happen.
  const tagihan = await deps.billing.tagihan(order.tagihanId);
  if (!tagihan) return { ok: false, reason: "tagihan_belum_ada" };
  if (tagihan.status === "lunas") return { ok: false, reason: "sudah_ada_bayar_langsung" };
  if (tagihan.status === "dibatalkan") return { ok: false, reason: "tagihan_dibatalkan" };
  if (tagihan.kind === "pay_first" && tagihan.dueAt <= deps.clock.now()) return { ok: false, reason: "batas_pembayaran_lewat" };
  const extension = documentExtension(input.bukti, BAYAR_LANGUNG_TYPES);
  if (!extension || input.bukti.body.byteLength > BAYAR_LANGUNG_MAX_BYTES) return { ok: false, reason: "bukti_tidak_didukung" };

  const now = deps.clock.now();
  const key = `bayar-langsung/${order.id}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.bukti.body, contentType: input.bukti.contentType });
  } catch {
    return { ok: false, reason: "penyimpanan_belum_tersedia" };
  }

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    // Billing settles the Tagihan inside this transaction, through its own public function, so the
    // payment and the order's record of it commit or roll back together.
    const settled = await deps.billing.within(tx).recordPayment(tagihan.id, {
      method: { kind: "langsung_ke_lokasi", lokasiName: order.lokasiName },
      reference: null,
      paidAt: now,
      proofKey: key,
    });
    if (!settled.ok) {
      // `tidak_ditemukan` cannot happen (the order names that Tagihan), and neither `baris_tidak_valid`
      // (the method is built here) nor `waktu_pembayaran_tidak_valid` (it is now). If any ever is, the
      // input is what is wrong, which is the truth the caller needs either way.
      if (settled.reason === "tidak_ditemukan") return { ok: false as const, reason: "tagihan_belum_ada" as const };
      if (settled.reason === "baris_tidak_valid" || settled.reason === "waktu_pembayaran_tidak_valid") {
        return { ok: false as const, reason: "input_tidak_valid" as const };
      }
      return settled;
    }
    if (!settled.settled) return { ok: false as const, reason: "sudah_ada_bayar_langsung" as const };
    await tx
      .update(pemesananMakam)
      .set({ bayarLangsungPada: now, bayarLangsungOleh: by.accountId, bayarLangsungBukti: key })
      .where(and(eq(pemesananMakam.id, order.id), isNull(pemesananMakam.bayarLangsungPada)));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "pembayaran.catat_langsung",
      entity: { kind: "pemesanan_makam", id: order.id },
      lokasiId: order.lokasiId,
      before: { tagihanStatus: tagihan.status, bayarLangsungPada: null },
      after: {
        tagihanStatus: "lunas",
        lokasi: order.lokasiName,
        nomorBukti: settled.bukti.nomorBukti,
        dibayarPada: now.toISOString(),
      },
      reason: null,
    });
    return { ok: true as const, pembayaran: settled.bukti };
  });
}
