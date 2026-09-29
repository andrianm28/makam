/**
 * Issuing a Bukti Pengembalian Dana (spec, Billing > Refunds: "Admin Platform
 * ... transfers by hand, uploads the proof and enters the date, which issues a
 * Bukti Pengembalian Dana and sets the Tagihan to Dikembalikan sebagian /
 * penuh"; ticket 31's AC 2, AC 4, AC 6).
 *
 * One transaction does the part that must never half-happen: the number (from
 * Billing's own `RFD` series), the Bukti row, the request's own status and the
 * Tagihan's status. Netting from the partner is part of the same rule money
 * follows elsewhere in this codebase (Payouts' own trigger): a **goodwill**
 * refund never touches Payouts at all (Operator-funded, never netted); every
 * other refund reduces what the Lokasi Mitra is still owed for this Tagihan —
 * `batalkanPencairanTagihan` for a "penuh" refund (which is exactly what a Saat
 * Duka cancellation is: the whole order, never paid for), `kurangiPencairanPesanan`
 * per Lokasi Mitra for a "sebagian" one. Either way, whatever was **already**
 * paid out is Payouts' own leftover (`sudahDicairkanUntukTagihan`) and becomes
 * a Potongan — recorded right after the transfer commits, the same way the
 * recipient's own message goes out after: a failure there must never undo a
 * transfer that really happened.
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
  /** Where a failure after the transfer is reported (the Potongan, the family's message): the transfer itself already happened, so this is never rolled back on it. */
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

  const hasil = await refusable<Penerbitan>(deps.db, (tx) => issueIn(deps, tx, by, { permintaanId: input.permintaanId, tanggal, key, header }, now));
  if (!hasil.ok) {
    await deps.files.delete(key).catch(() => undefined);
    return hasil;
  }
  const { bukti, tidakTertutup } = hasil;

  // After the transfer really happened: whatever was already paid out to a
  // Lokasi Mitra becomes a Potongan, and the family hears about its money.
  // Neither may undo the transfer, so neither runs inside its transaction; a
  // failure here is reported, not lost and not silently swallowed.
  await afterTransfer(deps, by, bukti, tidakTertutup).catch((error) => {
    deps.reportError?.(error instanceof Error ? error : new Error(String(error)), {
      tags: { module: "refunds", event: "setelah_transfer_gagal", nomorBukti: bukti.nomor },
    });
  });
  return { ok: true, bukti };
}

/**
 * A transfer that was issued. `tidakTertutup` is what a "sebagian" refund could not take off the Lokasi Mitra's
 * unpaid Pencairan, by Lokasi: exactly what an already paid item must give back as a Potongan (never more than the
 * refund itself). Null for a "penuh" refund, whose already paid items are all given back.
 */
interface Diterbitkan {
  ok: true;
  bukti: BuktiPengembalianDana;
  tidakTertutup: Map<string, number> | null;
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
  return { ok: true, bukti: dibaca, tidakTertutup };
}

/** What a Tagihan's items already paid to a Lokasi Mitra become: a Potongan, and the family's own message. */
async function afterTransfer(deps: TransferDeps, by: Actor, bukti: BuktiPengembalianDana, tidakTertutup: Map<string, number> | null): Promise<void> {
  const permintaan = await permintaanForBukti(deps.db, bukti.id);
  if (permintaan && !permintaan.goodwill) {
    const sudahDicairkan = await deps.payouts.sudahDicairkanUntukTagihan(bukti.tagihanId);
    for (const { lokasiId, amount: dicairkan } of sudahDicairkan) {
      const amount = tidakTertutup === null ? dicairkan : Math.min(dicairkan, tidakTertutup.get(lokasiId) ?? 0);
      if (amount <= 0) continue;
      await deps.payouts.catatPotongan(by, {
        lokasiId,
        amount,
        alasanKind: "pengembalian_dana",
        alasan: `Pengembalian dana ${bukti.nomor}: sudah dicairkan sebelum pengembalian disetujui.`,
        tautan: deps.buktiUrl(bukti.link),
      });
    }
  }
  await deps.notifications.pengembalianTerbit({
    tagihanId: bukti.tagihanId,
    nomorTagihan: bukti.nomorTagihan,
    nomorPemesanan: bukti.nomorPemesanan,
    jumlah: bukti.amount,
    biayaLayananPlatformDikembalikan: bukti.biayaLayananPlatformDikembalikan,
    link: bukti.link,
  });
}

async function permintaanForBukti(db: Database, buktiId: string): Promise<{ goodwill: boolean } | null> {
  const [row] = await db.select({ goodwill: permintaanPengembalian.goodwill }).from(permintaanPengembalian).where(eq(permintaanPengembalian.buktiId, buktiId));
  return row ?? null;
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
