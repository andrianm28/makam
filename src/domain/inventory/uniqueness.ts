import { and, eq, inArray, ne, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { foldKey } from "./ids";
import { inventoryKavling, inventoryPetak } from "./schema";

/**
 * Which of `numbers` (Nomor Makam, folded) are already used by a Petak of
 * `lokasiId`, other than `excludeCellIds`. Nomor Makam must be unique per
 * Lokasi Mitra across every Blok (spec, Inventory > Denah).
 */
export async function conflictingNomorMakam(
  db: Database,
  lokasiId: string,
  numbers: readonly string[],
  excludeCellIds: readonly string[] = [],
): Promise<string[]> {
  if (numbers.length === 0) return [];
  const keys = numbers.map(foldKey);
  const rows = await db
    .select({ nomorMakamKey: inventoryPetak.nomorMakamKey, nomorMakam: inventoryPetak.nomorMakam })
    .from(inventoryPetak)
    .where(
      and(
        eq(inventoryPetak.lokasiId, lokasiId),
        inArray(inventoryPetak.nomorMakamKey, keys),
        excludeCellIds.length ? notInArray(inventoryPetak.id, [...excludeCellIds]) : undefined,
      ),
    );
  return rows.map((row) => row.nomorMakam!).filter((value): value is string => value !== null);
}

/** Which of `numbers` (Nomor Kavling, folded) are already used by a Kavling Keluarga of `lokasiId`. */
export async function conflictingNomorKavling(
  db: Database,
  lokasiId: string,
  numbers: readonly string[],
  excludeKavlingId?: string,
): Promise<string[]> {
  if (numbers.length === 0) return [];
  const keys = numbers.map(foldKey);
  const rows = await db
    .select({ nomorKavlingKey: inventoryKavling.nomorKavlingKey, nomorKavling: inventoryKavling.nomorKavling })
    .from(inventoryKavling)
    .where(
      and(
        eq(inventoryKavling.lokasiId, lokasiId),
        inArray(inventoryKavling.nomorKavlingKey, keys),
        excludeKavlingId ? ne(inventoryKavling.id, excludeKavlingId) : undefined,
      ),
    );
  return rows.map((row) => row.nomorKavling);
}

/**
 * The next `count` numbers from `pattern` (from n = 1) that collide with no
 * existing Nomor Makam of the Lokasi Mitra, in order. Checks candidates in
 * growing batches (one query per batch) rather than one at a time.
 */
export async function nextFreeNumbers(
  db: Database,
  lokasiId: string,
  pattern: string,
  count: number,
  numberFromPattern: (pattern: string, n: number) => string,
): Promise<string[]> {
  const out: string[] = [];
  let from = 1;
  let batch = Math.max(count * 2, 20);
  while (out.length < count && from < 1_000_000) {
    const candidates = Array.from({ length: batch }, (_, i) => numberFromPattern(pattern, from + i));
    const taken = new Set((await conflictingNomorMakam(db, lokasiId, candidates)).map(foldKey));
    for (const candidate of candidates) {
      if (out.length >= count) break;
      if (!taken.has(foldKey(candidate))) out.push(candidate);
    }
    from += batch;
    batch *= 2;
  }
  return out;
}
