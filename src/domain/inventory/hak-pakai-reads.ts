import { desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { ActiveHakPakaiForStatus, HakPakaiStatus } from "./status";
import { inventoryHakPakai, inventoryPemakaman, inventoryPemegangHak } from "./schema";

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
  calonPenghuni: string | null;
  perluVerifikasi: boolean;
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
    calonPenghuni: row.calonPenghuni,
    perluVerifikasi: row.perluVerifikasi,
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
  return hakPakai ? { status: hakPakai.status, pembongkaranAt: null } : null;
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

/**
 * The whole date of a Hak Pakai's **first** Pemakaman, or null while it has none.
 * The tenure clock starts there (CONTEXT.md: a fixed term is counted from the
 * first Pemakaman), and it is what makes a Terencana Pencairan due sooner than
 * the end of its Masa Pembatalan (ticket 37). A date, not an instant: a burial
 * has no time of day, so the caller turns it into an instant on its own calendar.
 */
export async function firstPemakamanDateOfHakPakai(db: Database, hakPakaiId: string): Promise<string | null> {
  const [row] = await db
    .select({ date: inventoryPemakaman.date })
    .from(inventoryPemakaman)
    .where(eq(inventoryPemakaman.hakPakaiId, hakPakaiId))
    .orderBy(inventoryPemakaman.date, inventoryPemakaman.id)
    .limit(1);
  return row?.date ?? null;
}

/** Which of `petakIds` have at least one Pemakaman recorded (for a Kavling Keluarga's Terpakai sebagian / Penuh count). */
export async function petakIdsWithPemakaman(db: Database, petakIds: readonly string[]): Promise<Set<string>> {
  if (petakIds.length === 0) return new Set();
  const rows = await db.selectDistinct({ petakId: inventoryPemakaman.petakId }).from(inventoryPemakaman).where(inArray(inventoryPemakaman.petakId, [...petakIds]));
  return new Set(rows.map((row) => row.petakId));
}
