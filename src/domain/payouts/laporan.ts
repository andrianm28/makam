/**
 * Reading the Bukti Pencairan for the monthly Laporan and the weekly outgoing
 * transfer list (spec, Work Queues > Laporan; ticket 33). A Pencairan counts on
 * the day Admin Platform says the bank transfer was made (`ditransfer_pada`),
 * which is a WIB calendar date, so a span here is a half-open pair of WIB dates.
 *
 * Nothing here moves money or changes a row; both reads answer nothing to anyone
 * but Admin Platform, the way the run itself does.
 */
import { and, asc, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { pencairanResource, writeRefusal, type Actor } from "@/domain/identity";
import { BUKTI_TRANSFER_URL_DETIK, type RentangTanggal } from "@/lib/rentang-tanggal";
import type { FileStore } from "@/ports/file-store";
import { buktiPencairan, buktiPencairanPotongan } from "./schema";

export type { RentangTanggal };

/** What the Bukti Pencairan of one kind of recipient transferred: the items paid (bruto), the Potongan netted off them, and what left the bank (neto = bruto - potongan). */
export interface PencairanDibayarPerJenis {
  jumlahBukti: number;
  bruto: number;
  potongan: number;
  neto: number;
}

export interface PencairanDibayar {
  lokasiMitra: PencairanDibayarPerJenis;
  mitraJasa: PencairanDibayarPerJenis;
}

const kosongPerJenis = (): PencairanDibayarPerJenis => ({ jumlahBukti: 0, bruto: 0, potongan: 0, neto: 0 });

/** What the Bukti Pencairan transferred in the span come to, by kind of recipient, with the Potongan each netted as its own (negative) line. */
export async function pencairanDibayar(db: Database, by: Actor, span: RentangTanggal): Promise<PencairanDibayar> {
  const hasil: PencairanDibayar = { lokasiMitra: kosongPerJenis(), mitraJasa: kosongPerJenis() };
  if (writeRefusal(by, "pencairan.lihat_semua", pencairanResource())) return hasil;
  const dalamRentang = and(gte(buktiPencairan.ditransferPada, span.dari), lt(buktiPencairan.ditransferPada, span.sampai));
  const rows = await db
    .select({
      penerimaKind: buktiPencairan.penerimaKind,
      jumlahBukti: sql<string>`count(*)`,
      neto: sql<string>`coalesce(sum(${buktiPencairan.amount}), 0)`,
    })
    .from(buktiPencairan)
    .where(dalamRentang)
    .groupBy(buktiPencairan.penerimaKind);
  const potonganRows = await db
    .select({ penerimaKind: buktiPencairan.penerimaKind, potongan: sql<string>`coalesce(sum(${buktiPencairanPotongan.amount}), 0)` })
    .from(buktiPencairanPotongan)
    .innerJoin(buktiPencairan, eq(buktiPencairan.id, buktiPencairanPotongan.buktiId))
    .where(dalamRentang)
    .groupBy(buktiPencairan.penerimaKind);
  const per = (kind: string) => (kind === "mitra_jasa" ? hasil.mitraJasa : hasil.lokasiMitra);
  for (const row of rows) {
    const target = per(row.penerimaKind);
    target.jumlahBukti += Number(row.jumlahBukti);
    target.neto += Number(row.neto);
  }
  for (const row of potonganRows) per(row.penerimaKind).potongan += Number(row.potongan);
  for (const target of [hasil.lokasiMitra, hasil.mitraJasa]) target.bruto = target.neto + target.potongan;
  return hasil;
}

/** One outgoing Pencairan transfer, as the weekly list shows it. */
export interface TransferKeluarPencairan {
  jenis: "pencairan";
  nomorBukti: string;
  /** WIB calendar date of the bank transfer, as Admin Platform entered it. */
  ditransferPada: string;
  penerima: string;
  amount: number;
  /** The Admin Platform who recorded the transfer: a Pencairan has no separate approval step, so it is its issuer (Entri Audit). */
  disetujuiOleh: string | null;
  /** The Bukti Pencairan's own page link (the unguessable part). */
  link: string;
  /** The transfer proof as a short-lived signed URL, or null when it cannot be signed. */
  buktiTransferUrl: string | null;
  dibuatPada: Date;
}

export async function transferKeluarPencairan(
  deps: { db: Database; audit: AuditLog; files: FileStore },
  by: Actor,
  span: RentangTanggal,
): Promise<TransferKeluarPencairan[]> {
  if (writeRefusal(by, "pencairan.lihat_semua", pencairanResource())) return [];
  const rows = await deps.db
    .select()
    .from(buktiPencairan)
    .where(and(gte(buktiPencairan.ditransferPada, span.dari), lt(buktiPencairan.ditransferPada, span.sampai)))
    .orderBy(asc(buktiPencairan.ditransferPada), asc(buktiPencairan.dibuatPada), asc(buktiPencairan.nomor));
  return Promise.all(
    rows.map(async (row) => {
      const entries = await deps.audit.entriesAbout({ kind: "bukti_pencairan", id: row.id });
      const terbit = entries.find((entry) => entry.action === "pencairan.terbitkan_bukti");
      const buktiTransferUrl = await deps.files.signedUrl(row.buktiTransferKey, { expiresInSeconds: BUKTI_TRANSFER_URL_DETIK }).catch(() => null);
      return {
        jenis: "pencairan" as const,
        nomorBukti: row.nomor,
        ditransferPada: row.ditransferPada,
        penerima: row.penerimaNama,
        amount: Number(row.amount),
        disetujuiOleh: terbit?.actor.accountId ?? null,
        link: row.link,
        buktiTransferUrl,
        dibuatPada: row.dibuatPada,
      };
    }),
  );
}
