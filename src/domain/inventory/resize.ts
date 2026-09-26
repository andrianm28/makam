import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { findBlok, isUsed, loadCells, loadKavlingByBlok } from "./grid";
import { foldKey } from "./ids";
import { lockBlok, lockLokasiInventory } from "./locks";
import { MAX_BLOK_DIMENSION } from "./blok";
import { numberFromPattern } from "./numbering";
import { inventoryBlok, inventoryPetak } from "./schema";
import { nextFreeNumbers } from "./uniqueness";

type NotFound = { ok: false; reason: "blok_tidak_ditemukan" };

export const edges = ["atas", "bawah", "kiri", "kanan"] as const;
export type Edge = (typeof edges)[number];

export type AddEdgeResult =
  | { ok: true; rows: number; cols: number }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "ukuran_maksimum" };

/**
 * Adds one row (`atas`/`bawah`) or column (`kiri`/`kanan`) at the named edge,
 * every new cell a Petak Makam of the Blok's default Jenis Makam, numbered
 * from its pattern (skipping any number already used elsewhere in the
 * Lokasi), Perlu Verifikasi.
 */
export async function addEdge(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, edge: Edge): Promise<AddEdgeResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!edges.includes(edge)) return { ok: false, reason: "blok_tidak_ditemukan" };

  const blok = await findBlok(deps.db, lokasiId, blokId);
  if (!blok) return { ok: false, reason: "blok_tidak_ditemukan" };
  const growingRows = edge === "atas" || edge === "bawah";
  const nextRows = growingRows ? blok.rows + 1 : blok.rows;
  const nextCols = growingRows ? blok.cols : blok.cols + 1;
  if (nextRows > MAX_BLOK_DIMENSION || nextCols > MAX_BLOK_DIMENSION) return { ok: false, reason: "ukuran_maksimum" };

  const newCellCount = growingRows ? blok.cols : blok.rows;
  const now = deps.clock.now();

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, blokId);
    await lockLokasiInventory(tx, lokasiId);
    const cells = await loadCells(tx, blokId);
    const numbers = await nextFreeNumbers(tx, lokasiId, blok.numberPattern, newCellCount, numberFromPattern);

    if (edge === "atas" || edge === "kiri") {
      // Shift every existing cell's row (atas) or column (kiri) by 1 to make room at index 0.
      // Highest index first: each cell's new position is only ever vacated by
      // the one above it, which must already have moved out of the way.
      const shifting = [...cells].sort((a, b) => (edge === "atas" ? b.row - a.row : b.col - a.col));
      for (const cell of shifting) {
        if (edge === "atas") await tx.update(inventoryPetak).set({ row: cell.row + 1 }).where(eq(inventoryPetak.id, cell.id));
        else await tx.update(inventoryPetak).set({ col: cell.col + 1 }).where(eq(inventoryPetak.id, cell.id));
      }
    }

    const newRowIndex = edge === "atas" ? 0 : blok.rows;
    const newColIndex = edge === "kiri" ? 0 : blok.cols;
    const values = Array.from({ length: newCellCount }, (_, i) => {
      const nomorMakam = numbers[i];
      return {
        blokId,
        lokasiId,
        row: growingRows ? newRowIndex : i,
        col: growingRows ? i : newColIndex,
        kind: "petak" as const,
        nomorMakam,
        nomorMakamKey: foldKey(nomorMakam),
        jenisMakamId: blok.defaultJenisMakamId,
        perluVerifikasi: true,
        createdAt: now,
      };
    });
    await tx.insert(inventoryPetak).values(values);
    await tx
      .update(inventoryBlok)
      .set({ rows: nextRows, cols: nextCols })
      .where(and(eq(inventoryBlok.id, blokId), eq(inventoryBlok.lokasiId, lokasiId)));

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.ubah_baris_kolom",
      entity: { kind: "denah_blok", id: blokId },
      lokasiId,
      before: { rows: blok.rows, cols: blok.cols },
      after: { rows: nextRows, cols: nextCols, edge },
      reason: null,
    });
    return { ok: true as const, rows: nextRows, cols: nextCols };
  });
}

export interface RemoveRowsOrColsInput {
  axis: "baris" | "kolom";
  /** 0-based indices, in the Blok's current numbering. */
  indices: number[];
}

export type RemoveRowsOrColsResult =
  | { ok: true; rows: number; cols: number }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "input_tidak_valid" }
  | { ok: false; reason: "pernah_dipakai"; cellIds: string[] }
  | { ok: false; reason: "termasuk_kavling"; kavlingIds: string[] }
  | { ok: false; reason: "ukuran_minimum" };

/**
 * Removes one or more rows or columns, only when none of their Petak was ever
 * used and none belongs to a Kavling Keluarga (split it first); the Blok must
 * keep at least 1 row and 1 column.
 */
export async function removeRowsOrCols(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, input: RemoveRowsOrColsInput): Promise<RemoveRowsOrColsResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = z.object({ axis: z.enum(["baris", "kolom"]), indices: z.array(z.number().int().min(0)).min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };

  const blok = await findBlok(deps.db, lokasiId, blokId);
  if (!blok) return { ok: false, reason: "blok_tidak_ditemukan" };
  const removed = new Set(parsed.data.indices);
  const bound = parsed.data.axis === "baris" ? blok.rows : blok.cols;
  if ([...removed].some((index) => index >= bound)) return { ok: false, reason: "input_tidak_valid" };
  const remainingSize = bound - removed.size;
  if (remainingSize < 1) return { ok: false, reason: "ukuran_minimum" };

  const [cells, kavling] = await Promise.all([loadCells(deps.db, blokId), loadKavlingByBlok(deps.db, blokId)]);
  const affected = cells.filter((cell) => removed.has(parsed.data.axis === "baris" ? cell.row : cell.col));
  const used = affected.filter((cell) => cell.kind === "petak" && isUsed(cell, kavling));
  if (used.length) return { ok: false, reason: "pernah_dipakai", cellIds: used.map((cell) => cell.id) };
  const kavlingIds = [...new Set(affected.filter((cell) => cell.kavlingId).map((cell) => cell.kavlingId!))];
  if (kavlingIds.length) return { ok: false, reason: "termasuk_kavling", kavlingIds };

  const kept = cells.filter((cell) => !removed.has(parsed.data.axis === "baris" ? cell.row : cell.col));
  const remap = (value: number) => value - [...removed].filter((index) => index < value).length;

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, blokId);
    for (const id of affected.map((cell) => cell.id)) {
      await tx.delete(inventoryPetak).where(eq(inventoryPetak.id, id));
    }
    for (const cell of kept) {
      const row = parsed.data.axis === "baris" ? remap(cell.row) : cell.row;
      const col = parsed.data.axis === "kolom" ? remap(cell.col) : cell.col;
      if (row !== cell.row || col !== cell.col) {
        await tx.update(inventoryPetak).set({ row, col }).where(eq(inventoryPetak.id, cell.id));
      }
    }
    const nextRows = parsed.data.axis === "baris" ? remainingSize : blok.rows;
    const nextCols = parsed.data.axis === "kolom" ? remainingSize : blok.cols;
    await tx
      .update(inventoryBlok)
      .set({ rows: nextRows, cols: nextCols })
      .where(and(eq(inventoryBlok.id, blokId), eq(inventoryBlok.lokasiId, lokasiId)));

    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.ubah_baris_kolom",
      entity: { kind: "denah_blok", id: blokId },
      lokasiId,
      before: { rows: blok.rows, cols: blok.cols },
      after: { rows: nextRows, cols: nextCols, removed: { axis: parsed.data.axis, indices: parsed.data.indices } },
      reason: null,
    });
    return { ok: true as const, rows: nextRows, cols: nextCols };
  });
}
