/**
 * The two payment paths a staff member records by hand (spec, Billing >
 * Payment: "manual (Transfer manual / Tunai by Admin Platform with proof;
 * 'Dibayar langsung ke Lokasi Mitra' by the Admin Lokasi with proof)"; ticket
 * 30's AC 1, 2).
 *
 * Both settle the Tagihan through `recordPayment`, the exact path a
 * PaymentProvider webhook settles it through: exactly one Bukti Pembayaran and
 * the downstream-effect registry, fired once (ticket 25's Bukti Pemesanan
 * among them). Only the method and who may record it differ.
 *
 * The proof file is the point of both: it goes to the private FileStore first
 * (like an agreement scan or a Bukti Pencairan's own transfer proof), and a
 * refused settlement leaves no file behind. The settlement and its Entri Audit
 * commit together, so a payment is never recorded without being audited and an
 * audit entry never outlives a settlement that did not happen.
 */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { lokasiMitraResource, tagihanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { OperatorSettings } from "@/domain/operator-settings";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import { recordPayment, type BuktiPembayaran } from "./documents";
import type { EffectDeps } from "./settlement";
import { noHeader } from "./shared";
import { readTagihan, type LineProvider } from "./tagihan";

/** The largest payment proof accepted, 10 MB (matches Payouts' transfer proof). */
export const BUKTI_PEMBAYARAN_PROOF_MAX_BYTES = 10 * 1024 * 1024;

const PROOF_TYPES: readonly DocumentContentType[] = ["application/pdf", "image/jpeg", "image/png"];

export interface PembayaranStafDeps extends EffectDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  files: FileStore;
  operatorSettings: Pick<OperatorSettings, "current">;
}

interface UploadedProof {
  body: Uint8Array;
  contentType: string;
}

/** Uploads a payment proof to the private FileStore; the key, or why it was refused. */
async function simpanBukti(deps: Pick<PembayaranStafDeps, "files">, prefix: string, bukti: UploadedProof): Promise<{ ok: true; key: string } | { ok: false }> {
  const extension = documentExtension(bukti, PROOF_TYPES);
  if (!extension || bukti.body.byteLength === 0 || bukti.body.byteLength > BUKTI_PEMBAYARAN_PROOF_MAX_BYTES) return { ok: false };
  const key = `${prefix}/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: bukti.body, contentType: bukti.contentType });
  } catch {
    return { ok: false };
  }
  return { ok: true, key };
}

// ---- Manual payment (Admin Platform: Transfer manual / Tunai) ----

export interface CatatPembayaranManualInput {
  tagihanId: string;
  metode: "transfer_manual" | "tunai";
  reference?: string | null;
  /** When the money was paid; not in the future. Default: now. */
  paidAt?: Date;
  bukti: UploadedProof;
}

export type CatatPembayaranManualResult =
  | { ok: true; bukti: BuktiPembayaran }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "sudah_lunas" }
  | { ok: false; reason: "tagihan_dibatalkan" }
  | { ok: false; reason: "batas_pembayaran_lewat" }
  | { ok: false; reason: "waktu_pembayaran_tidak_valid" }
  | { ok: false; reason: "berkas_tidak_didukung" }
  /** Never reached: `manualInputSchema` already builds a valid `PaymentMethod`. */
  | { ok: false; reason: "baris_tidak_valid" }
  | typeof noHeader;

const manualInputSchema = z.object({
  tagihanId: z.uuid(),
  metode: z.enum(["transfer_manual", "tunai"]),
  reference: z.string().trim().min(1).max(200).nullish(),
  paidAt: z.date().optional(),
});

/**
 * Admin Platform marks a Tagihan paid by hand: Transfer manual or Tunai, with
 * a required proof file (AC 1). Settles it exactly as a PaymentProvider
 * webhook does, and records one Entri Audit in the same transaction as the
 * settlement.
 */
export async function catatPembayaranManual(
  deps: PembayaranStafDeps,
  by: Actor,
  input: CatatPembayaranManualInput,
): Promise<CatatPembayaranManualResult> {
  const refusal = writeRefusal(by, "tagihan.catat_pembayaran_manual", tagihanResource());
  if (refusal) return refusal;
  const parsed = manualInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  const paidAt = parsed.data.paidAt ?? now;
  if (paidAt > now) return { ok: false, reason: "waktu_pembayaran_tidak_valid" };

  const existing = await readTagihan(deps.db, parsed.data.tagihanId);
  if (!existing) return { ok: false, reason: "tidak_ditemukan" };
  if (existing.status === "lunas") return { ok: false, reason: "sudah_lunas" };

  const uploaded = await simpanBukti(deps, "pembayaran", input.bukti);
  if (!uploaded.ok) return { ok: false, reason: "berkas_tidak_didukung" };

  const result = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const settled = await recordPayment(
      { ...deps, db: tx },
      parsed.data.tagihanId,
      {
        method: { kind: parsed.data.metode },
        reference: parsed.data.reference?.trim() || null,
        paidAt,
        proofKey: uploaded.key,
      },
      now,
    );
    if (!settled.ok) return settled;
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "tagihan.catat_pembayaran_manual",
      entity: { kind: "bukti_pembayaran", id: settled.bukti.id },
      before: null,
      after: {
        nomorTagihan: settled.bukti.tagihan.nomorTagihan,
        metode: parsed.data.metode,
        amount: settled.bukti.amount,
        reference: settled.bukti.reference,
      },
      reason: null,
    });
    return settled;
  });
  if (!result.ok) await deps.files.delete(uploaded.key).catch(() => undefined);
  return result;
}

// ---- Direct payment (the Tagihan's own Admin Lokasi: "Dibayar langsung ke Lokasi Mitra") ----

export interface CatatPembayaranLangsungInput {
  tagihanId: string;
  paidAt?: Date;
  bukti: UploadedProof;
}

export type CatatPembayaranLangsungResult =
  | { ok: true; bukti: BuktiPembayaran }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "sudah_lunas" }
  | { ok: false; reason: "tagihan_dibatalkan" }
  | { ok: false; reason: "batas_pembayaran_lewat" }
  | { ok: false; reason: "waktu_pembayaran_tidak_valid" }
  | { ok: false; reason: "berkas_tidak_didukung" }
  /** The Tagihan carries no Lokasi Mitra tariff line: there is no partner to have paid it directly. */
  | { ok: false; reason: "bukan_lokasi_mitra" }
  /** Never reached: `langsungInputSchema` and `lokasiOf` already build a valid `PaymentMethod`. */
  | { ok: false; reason: "baris_tidak_valid" }
  | typeof noHeader;

const langsungInputSchema = z.object({ tagihanId: z.uuid(), paidAt: z.date().optional() });

/** The Lokasi Mitra a Tagihan's own tariff lines name, or null for one with none (a TPU order). */
function lokasiOf(lines: readonly { provider: LineProvider }[]): { lokasiId: string; name: string } | null {
  const line = lines.find((entry): entry is { provider: Extract<LineProvider, { kind: "lokasi_mitra" }> } => entry.provider.kind === "lokasi_mitra");
  return line ? { lokasiId: line.provider.lokasiId, name: line.provider.name } : null;
}

/**
 * The Tagihan's own Admin Lokasi records that the family paid the Lokasi
 * Mitra directly, with a required proof file (AC 2). The Bukti Pembayaran
 * reads "diterima oleh Lokasi Mitra X" (`shared.ts`'s `PaymentMethod`), and
 * the Payouts trigger reads the very same method to record that no tariff
 * Pencairan is due and a platform-fee Potongan is owed instead (ticket 32,
 * already wired: `trigger.ts`'s `potongLangsung`).
 */
export async function catatPembayaranLangsung(
  deps: PembayaranStafDeps,
  by: Actor,
  input: CatatPembayaranLangsungInput,
): Promise<CatatPembayaranLangsungResult> {
  const parsed = langsungInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  const paidAt = parsed.data.paidAt ?? now;
  if (paidAt > now) return { ok: false, reason: "waktu_pembayaran_tidak_valid" };

  const existing = await readTagihan(deps.db, parsed.data.tagihanId);
  if (!existing) return { ok: false, reason: "tidak_ditemukan" };
  const lokasi = lokasiOf(existing.lines);
  if (!lokasi) return { ok: false, reason: "bukan_lokasi_mitra" };
  const refusal = writeRefusal(by, "tagihan.catat_pembayaran_langsung", lokasiMitraResource(lokasi.lokasiId));
  if (refusal) return refusal;
  if (existing.status === "lunas") return { ok: false, reason: "sudah_lunas" };

  const uploaded = await simpanBukti(deps, "pembayaran", input.bukti);
  if (!uploaded.ok) return { ok: false, reason: "berkas_tidak_didukung" };

  const result = await deps.audit.staffWrite(deps.db, async (tx, record) => {
    const settled = await recordPayment(
      { ...deps, db: tx },
      parsed.data.tagihanId,
      { method: { kind: "langsung_ke_lokasi", lokasiName: lokasi.name }, reference: null, paidAt, proofKey: uploaded.key },
      now,
    );
    if (!settled.ok) return settled;
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "tagihan.catat_pembayaran_langsung",
      entity: { kind: "bukti_pembayaran", id: settled.bukti.id },
      lokasiId: lokasi.lokasiId,
      before: null,
      after: { nomorTagihan: settled.bukti.tagihan.nomorTagihan, amount: settled.bukti.amount },
      reason: null,
    });
    return settled;
  });
  if (!result.ok) await deps.files.delete(uploaded.key).catch(() => undefined);
  return result;
}
