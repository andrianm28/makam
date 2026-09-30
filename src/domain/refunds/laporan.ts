/**
 * Reading the Bukti Pengembalian Dana for the monthly Laporan and the weekly
 * outgoing transfer list (spec, Work Queues > Laporan; ticket 33). A refund
 * counts on the day Admin Platform says the bank transfer was made
 * (`ditransfer_pada`), a WIB calendar date, so a span is a half-open pair of WIB
 * dates. Both reads answer nothing to anyone but Admin Platform.
 */
import { and, asc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import { pengembalianResource, writeRefusal, type Actor } from "@/domain/identity";
import { BUKTI_TRANSFER_URL_DETIK, type RentangTanggal } from "@/lib/rentang-tanggal";
import type { FileStore } from "@/ports/file-store";
import { buktiPengembalianDana, permintaanPengembalian } from "./schema";

export type { RentangTanggal };

export interface PengembalianDibayar {
  jumlahBukti: number;
  /** What left the bank for the refunds transferred in the span. */
  amount: number;
  /** Of that, the Biaya Layanan Platform a refund returned to the family (the fault rule): the Operator's fee earned is that much less. */
  biayaLayananPlatformDikembalikan: number;
}

/** What the Bukti Pengembalian Dana transferred in the span come to, and how much of it was the Operator's own fee handed back. */
export async function pengembalianDibayar(
  deps: { db: Database; billing: Pick<Billing, "tagihan"> },
  by: Actor,
  span: RentangTanggal,
): Promise<PengembalianDibayar> {
  const hasil: PengembalianDibayar = { jumlahBukti: 0, amount: 0, biayaLayananPlatformDikembalikan: 0 };
  if (writeRefusal(by, "pengembalian.kelola", pengembalianResource())) return hasil;
  const rows = await deps.db
    .select({ tagihanId: buktiPengembalianDana.tagihanId, amount: buktiPengembalianDana.amount, denganFee: buktiPengembalianDana.biayaLayananPlatformDikembalikan })
    .from(buktiPengembalianDana)
    .where(and(gte(buktiPengembalianDana.ditransferPada, span.dari), lt(buktiPengembalianDana.ditransferPada, span.sampai)));
  for (const row of rows) {
    hasil.jumlahBukti += 1;
    hasil.amount += Number(row.amount);
    if (!row.denganFee) continue;
    const tagihan = await deps.billing.tagihan(row.tagihanId);
    hasil.biayaLayananPlatformDikembalikan += tagihan?.lines.find((line) => line.kind === "biaya_layanan_platform")?.amount ?? 0;
  }
  return hasil;
}

/** One outgoing refund transfer, as the weekly list shows it. */
export interface TransferKeluarPengembalian {
  jenis: "pengembalian";
  nomorBukti: string;
  /** WIB calendar date of the bank transfer, as Admin Platform entered it. */
  ditransferPada: string;
  /** The account holder the money went to. */
  penerima: string;
  amount: number;
  /** The Admin Platform who approved the refund; null only for a request approved before approvals were recorded. */
  disetujuiOleh: string | null;
  link: string;
  /** The transfer proof as a short-lived signed URL, or null when it cannot be signed. */
  buktiTransferUrl: string | null;
  dibuatPada: Date;
}

export async function transferKeluarPengembalian(
  deps: { db: Database; files: FileStore },
  by: Actor,
  span: RentangTanggal,
): Promise<TransferKeluarPengembalian[]> {
  if (writeRefusal(by, "pengembalian.kelola", pengembalianResource())) return [];
  const rows = await deps.db
    .select({ bukti: buktiPengembalianDana, disetujuiOleh: permintaanPengembalian.disetujuiOleh })
    .from(buktiPengembalianDana)
    .leftJoin(permintaanPengembalian, eq(permintaanPengembalian.id, buktiPengembalianDana.permintaanId))
    .where(and(gte(buktiPengembalianDana.ditransferPada, span.dari), lt(buktiPengembalianDana.ditransferPada, span.sampai)))
    .orderBy(asc(buktiPengembalianDana.ditransferPada), asc(buktiPengembalianDana.dibuatPada), asc(buktiPengembalianDana.nomor));
  return Promise.all(
    rows.map(async ({ bukti, disetujuiOleh }) => ({
      jenis: "pengembalian" as const,
      nomorBukti: bukti.nomor,
      ditransferPada: bukti.ditransferPada,
      penerima: bukti.rekeningNama,
      amount: Number(bukti.amount),
      disetujuiOleh,
      link: bukti.link,
      buktiTransferUrl: await deps.files.signedUrl(bukti.buktiTransferKey, { expiresInSeconds: BUKTI_TRANSFER_URL_DETIK }).catch(() => null),
      dibuatPada: bukti.dibuatPada,
    })),
  );
}
