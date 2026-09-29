/**
 * Internal to the Refunds module: the shape a request and a Bukti Pengembalian
 * Dana take outside the database. Nothing here authorises anybody or writes
 * anything.
 */
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { DocumentHeader } from "@/domain/billing";
import type { Rupiah } from "@/lib/rupiah";
import type { RefundLine } from "./request";
import {
  buktiPengembalianDana,
  permintaanPengembalian,
  type PermintaanPengembalianStatus,
  type PermintaanSumberKind,
  type PihakBersalah,
} from "./schema";

export type PermintaanRow = typeof permintaanPengembalian.$inferSelect;

/** One refund request, as the reads and a Server Action see it. */
export interface PermintaanPengembalian {
  id: string;
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  sumber: PermintaanSumberKind;
  pihakBersalah: PihakBersalah;
  biayaLayananPlatformDikembalikan: boolean;
  goodwill: boolean;
  penuh: boolean;
  lines: RefundLine[];
  jumlah: Rupiah;
  catatan: string | null;
  diajukanPada: Date;
  diajukanOleh: string | null;
  status: PermintaanPengembalianStatus;
  disetujuiPada: Date | null;
  tenggatTransferPada: Date | null;
  rekening: { bank: string; nomor: string; nama: string } | null;
  buktiId: string | null;
}

export function toPermintaan(row: PermintaanRow): PermintaanPengembalian {
  return {
    id: row.id,
    tagihanId: row.tagihanId,
    nomorTagihan: row.nomorTagihan,
    nomorPemesanan: row.nomorPemesanan,
    sumber: row.sumber as PermintaanSumberKind,
    pihakBersalah: row.pihakBersalah as PihakBersalah,
    biayaLayananPlatformDikembalikan: row.biayaLayananPlatformDikembalikan,
    goodwill: row.goodwill,
    penuh: row.penuh,
    lines: row.lines as RefundLine[],
    jumlah: row.jumlah,
    catatan: row.catatan,
    diajukanPada: row.diajukanPada,
    diajukanOleh: row.diajukanOleh,
    status: row.status as PermintaanPengembalianStatus,
    disetujuiPada: row.disetujuiPada,
    tenggatTransferPada: row.tenggatTransferPada,
    rekening: row.rekeningBank && row.rekeningNomor && row.rekeningNama ? { bank: row.rekeningBank, nomor: row.rekeningNomor, nama: row.rekeningNama } : null,
    buktiId: row.buktiId,
  };
}

/** Every open request (diajukan or disetujui), oldest first: what Admin Platform works through. */
export async function permintaanTerbuka(db: Database): Promise<PermintaanPengembalian[]> {
  const rows = await db
    .select()
    .from(permintaanPengembalian)
    .where(isNull(permintaanPengembalian.buktiId))
    .orderBy(asc(permintaanPengembalian.diajukanPada));
  return rows.map(toPermintaan);
}

/** Every approved request whose deadline has passed the tick's own read (used by the Tier 3 row's own query, unfiltered by time — the row type applies the deadline). */
export async function permintaanDisetujui(db: Database): Promise<PermintaanPengembalian[]> {
  const rows = await db
    .select()
    .from(permintaanPengembalian)
    .where(eq(permintaanPengembalian.status, "disetujui"))
    .orderBy(asc(permintaanPengembalian.tenggatTransferPada));
  return rows.map(toPermintaan);
}

/**
 * The open request (diajukan or disetujui) on one order, newest first, or null:
 * what the Pemesan's own order page reads to offer the bank-account form.
 */
export async function permintaanUntukPesanan(db: Database, nomorPemesanan: string): Promise<PermintaanPengembalian | null> {
  const [row] = await db
    .select()
    .from(permintaanPengembalian)
    .where(and(eq(permintaanPengembalian.nomorPemesanan, nomorPemesanan), inArray(permintaanPengembalian.status, ["diajukan", "disetujui"])))
    .orderBy(desc(permintaanPengembalian.diajukanPada));
  return row ? toPermintaan(row) : null;
}

export async function permintaanById(db: Database, id: string): Promise<PermintaanPengembalian | null> {
  const [row] = await db.select().from(permintaanPengembalian).where(eq(permintaanPengembalian.id, id));
  return row ? toPermintaan(row) : null;
}

export interface BuktiPengembalianDana {
  id: string;
  nomor: string;
  link: string;
  tagihanId: string;
  nomorTagihan: string;
  nomorPemesanan: string | null;
  amount: Rupiah;
  biayaLayananPlatformDikembalikan: boolean;
  lines: RefundLine[];
  rekening: { bank: string; nomor: string; nama: string };
  ditransferPada: string;
  header: DocumentHeader;
  dibuatPada: Date;
  /** The FileStore key of the transfer proof; only `Refunds.buktiPengembalianDana` turns it into a short-lived URL. */
  buktiTransferKey: string;
}

export async function buktiById(db: Database, id: string): Promise<BuktiPengembalianDana | null> {
  const [row] = await db.select().from(buktiPengembalianDana).where(eq(buktiPengembalianDana.id, id));
  return row ? toBukti(row) : null;
}

export async function buktiByLink(db: Database, link: string): Promise<BuktiPengembalianDana | null> {
  const [row] = await db.select().from(buktiPengembalianDana).where(eq(buktiPengembalianDana.link, link));
  return row ? toBukti(row) : null;
}

function toBukti(row: typeof buktiPengembalianDana.$inferSelect): BuktiPengembalianDana {
  return {
    id: row.id,
    nomor: row.nomor,
    link: row.link,
    tagihanId: row.tagihanId,
    nomorTagihan: row.nomorTagihan,
    nomorPemesanan: row.nomorPemesanan,
    amount: row.amount,
    biayaLayananPlatformDikembalikan: row.biayaLayananPlatformDikembalikan,
    lines: row.lines as RefundLine[],
    rekening: { bank: row.rekeningBank, nomor: row.rekeningNomor, nama: row.rekeningNama },
    ditransferPada: row.ditransferPada,
    header: row.header as DocumentHeader,
    dibuatPada: row.dibuatPada,
    buktiTransferKey: row.buktiTransferKey,
  };
}
