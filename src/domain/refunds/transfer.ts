/**
 * Issuing a Bukti Pengembalian Dana (spec, Billing > Refunds: "Admin Platform
 * ... transfers by hand, uploads the proof and enters the date, which issues a
 * Bukti Pengembalian Dana and sets the Tagihan to Dikembalikan sebagian /
 * penuh"; ticket 31's AC 2, AC 4, AC 6).
 *
 * One transaction does the part that must never half-happen: the number (from
 * Billing's own `RFD` series), the Bukti row, the request's own status, the
 * Tagihan's status, the netting and any Potongan. Netting from the partner is part of the same rule money
 * follows elsewhere in this codebase (Payouts' own trigger): a **goodwill**
 * refund never touches Payouts at all (Operator-funded, never netted); every
 * other refund reduces what the Lokasi Mitra is still owed for this Tagihan —
 * `batalkanPencairanTagihan` for a "penuh" refund (which is exactly what a Saat
 * Duka cancellation is: the whole order, never paid for), `kurangiPencairanPesanan`
 * per Lokasi Mitra for a "sebagian" one. Either way, whatever was **already**
 * paid out is Payouts' own leftover (`sudahDicairkanUntukTagihan`) and becomes
 * a Potongan, recorded in that same transaction: a debt the Lokasi Mitra owes
 * is never lost while the refund that caused it stands. When it cannot be
 * recorded nothing is issued, and Admin Platform records the transfer again.
 * Only the recipient's own message goes out after the commit, since a failed
 * message must never undo a recorded transfer.
 */
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { AuditLog } from "@/domain/audit";
import { currentHeader, newDocumentLink, noHeader, type Billing, type DocumentHeader } from "@/domain/billing";
import { pengembalianResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { Notifications } from "@/domain/notifications";
import type { OperatorSettings } from "@/domain/operator-settings";
import type { Payouts } from "@/domain/payouts";
import { documentExtension } from "@/lib/files/document-type";
import type { ReportError } from "@/lib/observability/report-error";
import { wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";
import { buktiById, type BuktiPengembalianDana } from "./baca";
import { buktiPengembalianDana, permintaanPengembalian } from "./schema";

/** The largest transfer proof accepted, 10 MB (the same cap as Bukti Pencairan's). */
export const BUKTI_TRANSFER_MAX_BYTES = 10 * 1024 * 1024;

export interface TransferDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  files: FileStore;
  operatorSettings: Pick<OperatorSettings, "current">;
  billing: Pick<Billing, "within">;
  payouts: Pick<Payouts, "batalkanPencairanTagihan" | "kurangiPencairanSebisanya" | "sudahDicairkanUntukTagihan" | "catatPotongan">;
  notifications: Pick<Notifications, "pengembalianTerbit">;
  /** The Bukti Pengembalian Dana page's absolute URL, sent to the Pemesan and given to a Potongan raised on it. */
  buktiUrl: (link: string) => string;
  /** Where a failure after the transfer is reported (the family's message): the transfer is already recorded, so this is never rolled back on it. */
  reportError?: ReportError;
}

export interface TerbitkanBuktiInput {
  permintaanId: string;
  /** The transfer's date as Admin Platform entered it (WIB "YYYY-MM-DD"), never in the future. */
  ditransferPada: string;
  bukti: { body: Uint8Array; contentType: string };
}

export type TerbitkanBuktiResult =
  | { ok: true; bukti: BuktiPengembalianDana }
  | WriteRefusal
  | typeof noHeader
  | { ok: false; reason: "tidak_ditemukan" }
  /** Not yet approved, or already transferred. */
  | { ok: false; reason: "belum_disetujui" }
  /** No bank account on file yet (AC 5: entered before a transfer). */
  | { ok: false; reason: "rekening_belum_diisi" }
  | { ok: false; reason: "tanggal_tidak_valid" }
  | { ok: false; reason: "berkas_tidak_didukung" };

export async function terbitkanBuktiPengembalianDana(deps: TransferDeps, by: Actor, input: TerbitkanBuktiInput): Promise<TerbitkanBuktiResult> {
  const refusal = writeRefusal(by, "pengembalian.kelola", pengembalianResource());
  if (refusal) return refusal;
  const header = await currentHeader(deps.operatorSettings);
  if (!header) return noHeader;
  if (!z.uuid().safeParse(input.permintaanId).success) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  const tanggal = tanggalTransfer(input.ditransferPada, now);
  if (!tanggal) return { ok: false, reason: "tanggal_tidak_valid" };
  const extension = documentExtension(input.bukti, ["application/pdf", "image/jpeg", "image/png"]);
  if (!extension || input.bukti.body.byteLength === 0 || input.bukti.body.byteLength > BUKTI_TRANSFER_MAX_BYTES) {
    return { ok: false, reason: "berkas_tidak_didukung" };
  }

  const key = `pengembalian/${randomUUID()}.${extension}`;
  try {
    await deps.files.put({ key, body: input.bukti.body, contentType: input.bukti.contentType });
  } catch {
    return { ok: false, reason: "berkas_tidak_didukung" };
  }

  let hasil: Penerbitan;
  try {
    hasil = await refusable<Penerbitan>(deps.db, (tx) => issueIn(deps, tx, by, { permintaanId: input.permintaanId, tanggal, key, header }, now));
  } catch (error) {
    await deps.files.delete(key).catch(() => undefined);
    throw error;
  }
  if (!hasil.ok) {
    await deps.files.delete(key).catch(() => undefined);
    return hasil;
  }
  const { bukti } = hasil;

  // After the transfer is recorded the family hears about its money. That may
  // not undo the record, so it runs outside the transaction; a failure here is
  // reported, not lost and not silently swallowed.
  await kabariPemesan(deps, bukti).catch((error) => {
    deps.reportError?.(error instanceof Error ? error : new Error(String(error)), {
      tags: { module: "refunds", event: "setelah_transfer_gagal", nomorBukti: bukti.nomor },
    });
  });
  return { ok: true, bukti };
}

/** A transfer that was issued. */
interface Diterbitkan {
  ok: true;
  bukti: BuktiPengembalianDana;
}

/** Either a refusal (nothing was written) or the transfer that was issued: the two never share a shape, so no cast is needed to tell them apart. */
type Penerbitan = Exclude<TerbitkanBuktiResult, { ok: true }> | Diterbitkan;

interface IssueIn {
  permintaanId: string;
  tanggal: string;
  key: string;
  header: DocumentHeader;
}

async function issueIn(deps: TransferDeps, tx: Database, by: Actor, input: IssueIn, now: Date): Promise<Penerbitan> {
  const [row] = await tx.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, input.permintaanId)).for("update");
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  if (row.status !== "disetujui") return { ok: false, reason: "belum_disetujui" };
  if (!row.rekeningBank || !row.rekeningNomor || !row.rekeningNama) return { ok: false, reason: "rekening_belum_diisi" };

  const nomor = await deps.billing.within(tx).nextDocumentNumber("RFD");
  const link = newDocumentLink();
  const [bukti] = await tx
    .insert(buktiPengembalianDana)
    .values({
      nomor,
      link,
      permintaanId: row.id,
      tagihanId: row.tagihanId,
      nomorTagihan: row.nomorTagihan,
      nomorPemesanan: row.nomorPemesanan,
      amount: row.jumlah,
      biayaLayananPlatformDikembalikan: row.biayaLayananPlatformDikembalikan,
      lines: row.lines,
      rekeningBank: row.rekeningBank,
      rekeningNomor: row.rekeningNomor,
      rekeningNama: row.rekeningNama,
      buktiTransferKey: input.key,
      ditransferPada: input.tanggal,
      header: input.header,
      dibuatPada: now,
    })
    .returning({ id: buktiPengembalianDana.id });

  await tx
    .update(permintaanPengembalian)
    .set({ status: "ditransfer", buktiId: bukti.id })
    .where(eq(permintaanPengembalian.id, row.id));

  await deps.billing.within(tx).tandaiPengembalian(row.tagihanId, { kind: row.penuh ? "penuh" : "sebagian" });

  // What a "sebagian" refund could not take off the Lokasi Mitra's unpaid Pencairan, by Lokasi: exactly what an
  // already paid item must give back as a Potongan (never more than the refund itself). Null for a "penuh" refund,
  // whose already paid items are all given back.
  let tidakTertutup: Map<string, number> | null = null;
  if (!row.goodwill) {
    if (row.penuh) {
      await deps.payouts.batalkanPencairanTagihan(tx, { tagihanId: row.tagihanId });
    } else {
      tidakTertutup = new Map();
      const perLokasi = groupByLokasi(row.lines as { label: string; amount: number; lokasiId: string | null }[]);
      for (const [lokasiId, amount] of perLokasi) {
        const dikurangi = await deps.payouts.kurangiPencairanSebisanya(tx, {
          nomorPemesanan: row.nomorPemesanan ?? "",
          lokasiId,
          amount,
          catatan: `Pengembalian dana ${nomor}`,
          oleh: by.accountId,
        });
        // The unpaid items were lowered by what they could cover; what is left was paid to the Lokasi Mitra before the refund:
        // it is a Potongan, and only that much (a refund that could not be applied at all is all of it).
        tidakTertutup.set(lokasiId, dikurangi.ok ? dikurangi.sisa : amount);
      }
    }
  }

  if (!row.goodwill) await catatPotonganIn(deps, tx, by, { tagihanId: row.tagihanId, nomor, link, tidakTertutup });

  await deps.audit.staffWrite(tx, async (auditTx, record) => {
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pengembalian.terbitkan_bukti",
      entity: { kind: "bukti_pengembalian_dana", id: bukti.id },
      lokasiId: null,
      before: null,
      after: { nomor, tagihanId: row.tagihanId, jumlah: row.jumlah, ditransferPada: input.tanggal, goodwill: row.goodwill },
      reason: null,
    });
    return { ok: true } as const;
  });

  const dibaca = await buktiById(tx, bukti.id);
  if (!dibaca) throw new Error("the Bukti Pengembalian Dana just issued was not found");
  return { ok: true, bukti: dibaca };
}

/**
 * What a Tagihan's items already paid to a Lokasi Mitra become: a Potongan, in the transfer's own transaction. A
 * Potongan Payouts refuses throws, so the whole transfer rolls back rather than standing without the debt it owes.
 */
async function catatPotonganIn(
  deps: TransferDeps,
  tx: Database,
  by: Actor,
  input: { tagihanId: string; nomor: string; link: string; tidakTertutup: Map<string, number> | null },
): Promise<void> {
  const sudahDicairkan = await deps.payouts.sudahDicairkanUntukTagihan(input.tagihanId, tx);
  for (const { lokasiId, amount: dicairkan } of sudahDicairkan) {
    const amount = input.tidakTertutup === null ? dicairkan : Math.min(dicairkan, input.tidakTertutup.get(lokasiId) ?? 0);
    if (amount <= 0) continue;
    const dicatat = await deps.payouts.catatPotongan(
      by,
      {
        lokasiId,
        amount,
        alasanKind: "pengembalian_dana",
        alasan: `Pengembalian dana ${input.nomor}: sudah dicairkan sebelum pengembalian disetujui.`,
        tautan: deps.buktiUrl(input.link),
      },
      tx,
    );
    if (!dicatat.ok) throw new Error(`the Potongan of ${input.nomor} for Lokasi ${lokasiId} was refused: ${dicatat.reason}`);
  }
}

/** The family's own message about its money, once the transfer is recorded. */
async function kabariPemesan(deps: TransferDeps, bukti: BuktiPengembalianDana): Promise<void> {
  await deps.notifications.pengembalianTerbit({
    tagihanId: bukti.tagihanId,
    nomorTagihan: bukti.nomorTagihan,
    nomorPemesanan: bukti.nomorPemesanan,
    jumlah: bukti.amount,
    biayaLayananPlatformDikembalikan: bukti.biayaLayananPlatformDikembalikan,
    link: bukti.link,
  });
}

function groupByLokasi(lines: { amount: number; lokasiId: string | null }[]): [string, number][] {
  const byLokasi = new Map<string, number>();
  for (const line of lines) {
    if (!line.lokasiId) continue;
    byLokasi.set(line.lokasiId, (byLokasi.get(line.lokasiId) ?? 0) + line.amount);
  }
  return [...byLokasi.entries()];
}

/** The transfer's date: a real WIB date, today included, never in the future. */
function tanggalTransfer(value: string, now: Date): string | null {
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success) return null;
  const hariIni = wibDateOf(now);
  return parsed.data <= hariIni ? parsed.data : null;
}
