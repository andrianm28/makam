/**
 * Internal to the Payouts module: the shape a Pencairan item, Potongan and run
 * row take outside the database, and the reads every caller shares. Nothing
 * here authorises anybody or writes anything: a caller that may not see a row
 * never gets here.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { BankAccount } from "@/domain/lokasi";
import type { Rupiah } from "@/lib/rupiah";
import { penerimaKey, type Penerima } from "./penerima";
import {
  pencairanItem,
  potongan,
  type PencairanItemKind,
  type PencairanItemReason,
  type PotonganAlasanKind,
} from "./schema";

/** One row of `pencairan_item`, as read: amounts already converted to `Rupiah`. */
export type ItemRow = typeof pencairanItem.$inferSelect;

/** What a Pencairan item is money for, as the runs, the views and a Bukti read it. */
export interface BarisItemPencairan {
  id: string;
  kind: PencairanItemKind;
  /** The wording the issued Tagihan line carried, which the Bukti Pencairan repeats. */
  label: string;
  /** What this item pays: the issued amount, or the amount a rule lowered it to. */
  amount: Rupiah;
  /** The issued amount itself, so a row can show what the adjustment did. */
  amountAwal: Rupiah;
  tagihanId: string | null;
  nomorPemesanan: string | null;
  /** A Layanan's target date (WIB "YYYY-MM-DD"), when the item is for one. */
  targetDate: string | null;
  dueAt: Date | null;
  /** 2 Hari Kerja after `dueAt` on the Admin Platform calendar. */
  jatuhTempoAt: Date | null;
  /** Which rule lowered the amount, and the note that rule required. */
  alasanPenyesuaian: PencairanItemReason | null;
  catatanPenyesuaian: string | null;
}

/** One Potongan as a run row and a Bukti Pencairan read it. */
export interface BarisPotongan {
  id: string;
  /** Positive: what the Lokasi owes the Operator. */
  amount: Rupiah;
  alasan: string;
  alasanKind: PotonganAlasanKind;
  tautan: string | null;
  dibuatPada: Date;
  /** How much of it the run this row belongs to would take; 0 outside a run. */
  dipotong: Rupiah;
}

/** One recipient's row of the Pencairan run: what it is owed, less what it owes. */
export interface BarisPencairan {
  recipient: Penerima;
  /** The due items that are not held out, oldest deadline first. */
  items: BarisItemPencairan[];
  /** One entry per order that has an item not due yet: what is still coming. */
  itemsBelumJatuhTempo: { nomorPemesanan: string | null }[];
  /** Items kept out of the run with their reason: shown, never transferred. */
  ditahan: { id: string; label: string; amount: Rupiah; alasan: string }[];
  /** The Potongan this recipient carries, oldest first; a Mitra Jasa never carries one. */
  potongan: BarisPotongan[];
  /** What the items come to. */
  jumlahItem: Rupiah;
  /** How much of the Potongan this row's transfer takes; the rest carries forward. */
  potonganDipotong: Rupiah;
  /**
   * What the transfer would be, or null when there is nothing to transfer: a
   * transfer of Rp 0 is not made, and a negative net is never made either.
   */
  neto: Rupiah | null;
  /** 2 Hari Kerja after the earliest due item: this row's deadline. */
  jatuhTempoAt: Date;
  /** Where the money goes: the Lokasi Mitra's bank account, which only an Admin Platform's read carries. */
  rekening: BankAccount | null;
}

/** The recipient an item row is for, as the domain spells it. */
export function recipientOf(row: Pick<ItemRow, "penerimaKind" | "lokasiId" | "penerimaNama" | "penerimaAkunId">): Penerima {
  if (row.penerimaKind === "mitra_jasa") {
    return {
      kind: "mitra_jasa",
      akunId: row.penerimaAkunId ?? "",
      nama: row.penerimaNama,
      lokasiId: row.lokasiId,
    };
  }
  return { kind: "lokasi_mitra", lokasiId: row.lokasiId ?? "", nama: row.penerimaNama };
}

/** The key two rows of the same recipient share. */
export { penerimaKey };

/** What an item pays: the adjusted amount when a rule lowered it, else the issued one. */
export function jumlahOf(row: ItemRow): Rupiah {
  return (row.jumlahDisesuaikan ?? row.amount) as Rupiah;
}

/** One item as the runs, the views and a Bukti read it. */
export function toBarisItem(row: ItemRow): BarisItemPencairan {
  return {
    id: row.id,
    kind: row.kind as PencairanItemKind,
    label: row.label,
    amount: jumlahOf(row),
    amountAwal: row.amount,
    tagihanId: row.tagihanId,
    nomorPemesanan: row.nomorPemesanan,
    targetDate: row.tanggalLayanan,
    dueAt: row.dueAt,
    jatuhTempoAt: row.jatuhTempoAt,
    alasanPenyesuaian: row.alasanPenyesuaian as PencairanItemReason | null,
    catatanPenyesuaian: row.catatanPenyesuaian,
  };
}

/** Every item that is due, oldest deadline first. Held-out items are among them: a run shows why they are not paid. */
export async function itemsDue(db: Database): Promise<ItemRow[]> {
  return db.select().from(pencairanItem).where(eq(pencairanItem.status, "jatuh_tempo")).orderBy(asc(pencairanItem.jatuhTempoAt));
}

/** Every item that is not due yet, oldest first. */
export async function itemsBelumJatuhTempo(db: Database): Promise<ItemRow[]> {
  return db
    .select()
    .from(pencairanItem)
    .where(eq(pencairanItem.status, "belum_jatuh_tempo"))
    .orderBy(asc(pencairanItem.dibuatPada));
}

/** What a Lokasi Mitra currently owes and may net: its `berjalan` Potongan, oldest first. */
export async function potonganBerjalan(db: Database, lokasiId: string): Promise<BarisPotongan[]> {
  const rows = await db
    .select()
    .from(potongan)
    .where(and(eq(potongan.lokasiId, lokasiId), eq(potongan.status, "berjalan")))
    .orderBy(asc(potongan.dibuatPada));
  return rows.map((row) => ({
    id: row.id,
    amount: row.amount,
    alasan: row.alasan,
    alasanKind: row.alasanKind as PotonganAlasanKind,
    tautan: row.tautan,
    dibuatPada: row.dibuatPada,
    dipotong: 0 as Rupiah,
  }));
}
