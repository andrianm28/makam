import { and, desc, eq, inArray, ne, type SQL } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { ActiveHakPakaiForStatus, HakPakaiStatus } from "./status";
import { inventoryHakPakai, inventoryPemakaman, inventoryPemegangHak, type SyaratHakPakai } from "./schema";

/** One Hak Pakai, as loaded (before the Pemegang Hak / Pemakaman rows it covers). */
export interface HakPakaiRow {
  id: string;
  lokasiId: string;
  petakId: string | null;
  kavlingId: string | null;
  status: HakPakaiStatus;
  endReason: string | null;
  tenureYears: number | null;
  startAt: Date;
  tenureStartAt: Date | null;
  endDate: Date | null;
  perluVerifikasi: boolean;
  /** The Syarat Pemesanan Terencana in force at payment, and the Calon Penghuni label; null for any other Hak Pakai. */
  syarat: SyaratHakPakai | null;
  calonPenghuni: string | null;
}

function toRow(row: typeof inventoryHakPakai.$inferSelect): HakPakaiRow {
  return {
    id: row.id,
    lokasiId: row.lokasiId,
    petakId: row.petakId,
    kavlingId: row.kavlingId,
    status: row.status,
    endReason: row.endReason,
    tenureYears: row.tenureYears,
    startAt: row.startAt,
    tenureStartAt: row.tenureStartAt,
    endDate: row.endDate,
    perluVerifikasi: row.perluVerifikasi,
    syarat: row.syarat ?? null,
    calonPenghuni: row.calonPenghuni,
  };
}

/**
 * The current Hak Pakai of a Petak: the latest by grant time. A Petak only
 * ever gets a second Hak Pakai once the first has ended and a new one is sold
 * (no ticket yet builds that), so today this is simply "the one Hak Pakai, if
 * any".
 */
export async function currentHakPakaiOfPetak(db: Database, petakId: string): Promise<HakPakaiRow | null> {
  const [row] = await db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.petakId, petakId)).orderBy(desc(inventoryHakPakai.startAt)).limit(1);
  return row ? toRow(row) : null;
}

/** The current Hak Pakai of a Kavling Keluarga; see `currentHakPakaiOfPetak`. */
export async function currentHakPakaiOfKavling(db: Database, kavlingId: string): Promise<HakPakaiRow | null> {
  const [row] = await db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.kavlingId, kavlingId)).orderBy(desc(inventoryHakPakai.startAt)).limit(1);
  return row ? toRow(row) : null;
}

/**
 * The Hak Pakai that **holds** a Petak: the latest one that is not Dibatalkan.
 *
 * A Dibatalkan Hak Pakai holds nothing (spec, Pemesanan > Saat Duka: cancelling
 * makes the Petak `Tersedia` at once), so a Petak whose right was given back is
 * free to be cleared, given to another family and sold again — which is the whole
 * point of cancelling. It is not the same question as `currentHakPakaiOfPetak`
 * ("which Hak Pakai is on record here", which is what a staff read shows, cancelled
 * or not), so both exist and neither is used for the other's question.
 */
export async function memegangPetak(db: Database, petakId: string): Promise<HakPakaiRow | null> {
  return memegang(db, eq(inventoryHakPakai.petakId, petakId));
}

/** The Hak Pakai that holds a Kavling Keluarga; see `memegangPetak`. */
export async function memegangKavling(db: Database, kavlingId: string): Promise<HakPakaiRow | null> {
  return memegang(db, eq(inventoryHakPakai.kavlingId, kavlingId));
}

async function memegang(db: Database, diTarget: SQL<unknown>): Promise<HakPakaiRow | null> {
  const rows = await db
    .select()
    .from(inventoryHakPakai)
    .where(and(diTarget, ne(inventoryHakPakai.status, "dibatalkan")))
    .orderBy(desc(inventoryHakPakai.startAt))
    .limit(1);
  return rows[0] ? toRow(rows[0]) : null;
}

/** Every current Hak Pakai of a whole Lokasi Mitra's Petak and Kavling Keluarga (for availability), by target id. */
export async function hakPakaiByTarget(db: Database, lokasiId: string): Promise<{ byPetak: Map<string, HakPakaiRow>; byKavling: Map<string, HakPakaiRow> }> {
  const rows = await db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.lokasiId, lokasiId)).orderBy(desc(inventoryHakPakai.startAt));
  const byPetak = new Map<string, HakPakaiRow>();
  const byKavling = new Map<string, HakPakaiRow>();
  for (const row of rows) {
    const hakPakai = toRow(row);
    if (hakPakai.petakId && !byPetak.has(hakPakai.petakId)) byPetak.set(hakPakai.petakId, hakPakai);
    if (hakPakai.kavlingId && !byKavling.has(hakPakai.kavlingId)) byKavling.set(hakPakai.kavlingId, hakPakai);
  }
  return { byPetak, byKavling };
}

/**
 * `hakPakai` as `derivePetakStatus` / `deriveKavlingStatus` need it.
 * `pembongkaranAt` is always null: no ticket yet records a Pembongkaran.
 */
export function forStatus(hakPakai: HakPakaiRow | null): ActiveHakPakaiForStatus | null {
  return hakPakai ? { status: hakPakai.status, pembongkaranAt: null, endReason: hakPakai.endReason } : null;
}

export interface PemegangHakRow {
  id: string;
  hakPakaiId: string;
  name: string | null;
  phoneNumber: string | null;
  email: string | null;
  startAt: Date;
  endAt: Date | null;
}

/** The current Pemegang Hak of a Hak Pakai (`end_at` null), or null when none is on record ("data menyusul"). */
export async function currentPemegangHak(db: Database, hakPakaiId: string): Promise<PemegangHakRow | null> {
  const rows = await db.select().from(inventoryPemegangHak).where(eq(inventoryPemegangHak.hakPakaiId, hakPakaiId));
  const current = rows.find((row) => row.endAt === null);
  return current ?? null;
}

/** Whether an earlier holder's row was closed on this Hak Pakai (a Ganti Pemegang Hak happened at some point). */
export async function pernahGantiPemegangHak(db: Database, hakPakaiId: string): Promise<boolean> {
  const rows = await db.select({ endAt: inventoryPemegangHak.endAt }).from(inventoryPemegangHak).where(eq(inventoryPemegangHak.hakPakaiId, hakPakaiId));
  return rows.some((row) => row.endAt !== null);
}

export interface PemakamanRow {
  id: string;
  lokasiId: string;
  petakId: string;
  hakPakaiId: string;
  almarhumName: string;
  date: string;
  layer: number;
}

/** Every Pemakaman recorded at a Petak, oldest first. */
export async function pemakamanOfPetak(db: Database, petakId: string): Promise<PemakamanRow[]> {
  return db.select().from(inventoryPemakaman).where(eq(inventoryPemakaman.petakId, petakId)).orderBy(inventoryPemakaman.date);
}

/** Every Pemakaman recorded under a Hak Pakai (a Kavling's Hak Pakai may cover several Petak), oldest first. */
export async function pemakamanOfHakPakai(db: Database, hakPakaiId: string): Promise<PemakamanRow[]> {
  return db.select().from(inventoryPemakaman).where(eq(inventoryPemakaman.hakPakaiId, hakPakaiId)).orderBy(inventoryPemakaman.date);
}

/** Which of `petakIds` have at least one Pemakaman recorded (for a Kavling Keluarga's Terpakai sebagian / Penuh count). */
export async function petakIdsWithPemakaman(db: Database, petakIds: readonly string[]): Promise<Set<string>> {
  if (petakIds.length === 0) return new Set();
  const rows = await db.selectDistinct({ petakId: inventoryPemakaman.petakId }).from(inventoryPemakaman).where(inArray(inventoryPemakaman.petakId, [...petakIds]));
  return new Set(rows.map((row) => row.petakId));
}
