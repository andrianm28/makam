import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { inventoryBlok, inventoryKavling, inventoryPetak, type inventoryPetakKinds } from "./schema";

export type PetakKind = (typeof inventoryPetakKinds)[number];

/** One Denah cell, as read from the database, row by row then column by column. */
export interface CellRow {
  id: string;
  row: number;
  col: number;
  kind: PetakKind;
  nomorMakam: string | null;
  jenisMakamId: string | null;
  kavlingId: string | null;
  perluVerifikasi: boolean;
  /** Set once this Petak has ever had a Hak Pakai or Pemakaman (ticket 14); until then always null. */
  firstUsedAt: Date | null;
}

export interface KavlingRow {
  id: string;
  nomorKavling: string;
  jenisMakamId: string;
  firstUsedAt: Date | null;
}

export interface BlokRecord {
  id: string;
  lokasiId: string;
  name: string;
  numberPattern: string;
  rows: number;
  cols: number;
  defaultJenisMakamId: string;
  photoFileKey: string | null;
}

/** A Blok's row by `lokasi_id` + `blok_id`, or null when it names no Blok of that Lokasi. */
export async function findBlok(db: Database, lokasiId: string, blokId: string): Promise<BlokRecord | null> {
  const [row] = await db
    .select()
    .from(inventoryBlok)
    .where(and(eq(inventoryBlok.id, blokId), eq(inventoryBlok.lokasiId, lokasiId)))
    .limit(1);
  return row ?? null;
}

/** Every Blok of a Lokasi Mitra, by name. */
export async function loadBloks(db: Database, lokasiId: string): Promise<BlokRecord[]> {
  return db.select().from(inventoryBlok).where(eq(inventoryBlok.lokasiId, lokasiId)).orderBy(asc(inventoryBlok.name));
}

/** Every cell of a Blok, in reading order (row, then column). */
export async function loadCells(db: Database, blokId: string): Promise<CellRow[]> {
  const rows = await db
    .select()
    .from(inventoryPetak)
    .where(eq(inventoryPetak.blokId, blokId))
    .orderBy(asc(inventoryPetak.row), asc(inventoryPetak.col));
  return rows.map((row) => ({
    id: row.id,
    row: row.row,
    col: row.col,
    kind: row.kind,
    nomorMakam: row.nomorMakam,
    jenisMakamId: row.jenisMakamId,
    kavlingId: row.kavlingId,
    perluVerifikasi: row.perluVerifikasi,
    firstUsedAt: row.firstUsedAt,
  }));
}

/** Every Kavling Keluarga of a Blok, by id. */
export async function loadKavlingByBlok(db: Database, blokId: string): Promise<Map<string, KavlingRow>> {
  const rows = await db.select().from(inventoryKavling).where(eq(inventoryKavling.blokId, blokId));
  return new Map(rows.map((row) => [row.id, { id: row.id, nomorKavling: row.nomorKavling, jenisMakamId: row.jenisMakamId, firstUsedAt: row.firstUsedAt }]));
}

/** A cell is "used" (can't be deleted, moved or retyped) once it, or its Kavling Keluarga, ever had a Hak Pakai or Pemakaman. */
export function isUsed(cell: CellRow, kavling: Map<string, KavlingRow>): boolean {
  if (cell.firstUsedAt) return true;
  const kav = cell.kavlingId ? kavling.get(cell.kavlingId) : undefined;
  return Boolean(kav?.firstUsedAt);
}
