import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { findBlok, isUsed, loadCells, loadKavlingByBlok, type CellRow } from "./grid";
import { foldKey } from "./ids";
import { areAdjacent } from "./kavling-rules";
import { jenisMakamBelongsToLokasi } from "./jenis-makam-lookup";
import { lockBlok, lockLokasiInventory } from "./locks";
import { kavlingPatternFrom, numberFromPattern } from "./numbering";
import { inventoryKavling, inventoryPetak } from "./schema";
import { conflictingNomorKavling } from "./uniqueness";

type NotFound = { ok: false; reason: "blok_tidak_ditemukan" };

export interface NewKavlingInput {
  cellIds: string[];
  jenisMakamId: string;
  /** Defaults to the next free number from the Blok's Kavling pattern (e.g. `A-K01`), editable. */
  nomorKavling?: string;
}

export type CreateKavlingResult =
  | { ok: true; kavlingId: string; nomorKavling: string }
  | WriteRefusal
  | NotFound
  | { ok: false; reason: "bukan_petak" }
  | { ok: false; reason: "kurang_dari_dua" }
  | { ok: false; reason: "pernah_dipakai"; cellIds: string[] }
  | { ok: false; reason: "sudah_kavling"; cellIds: string[] }
  | { ok: false; reason: "tidak_bersambung" }
  | { ok: false; reason: "jenis_makam_tidak_ditemukan" }
  | { ok: false; reason: "nomor_sudah_dipakai"; conflicts: string[] };

/**
 * Groups at least 2 adjacent (edge-connected, never diagonal) Petak Makam of
 * one Blok into a Kavling Keluarga, sold under one Hak Pakai with its own
 * Jenis Makam and Nomor Kavling.
 */
export async function createKavling(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, input: NewKavlingInput): Promise<CreateKavlingResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = z
    .object({ cellIds: z.array(z.uuid()).min(1), jenisMakamId: z.uuid(), nomorKavling: z.string().trim().min(1).max(60).optional() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "kurang_dari_dua" };

  const blok = await findBlok(deps.db, lokasiId, blokId);
  if (!blok) return { ok: false, reason: "blok_tidak_ditemukan" };
  const [cells, kavling] = await Promise.all([loadCells(deps.db, blokId), loadKavlingByBlok(deps.db, blokId)]);
  const selected = cells.filter((cell) => parsed.data.cellIds.includes(cell.id));
  if (selected.some((cell) => cell.kind !== "petak")) return { ok: false, reason: "bukan_petak" };
  if (selected.length < 2) return { ok: false, reason: "kurang_dari_dua" };
  const used = selected.filter((cell) => isUsed(cell, kavling));
  if (used.length) return { ok: false, reason: "pernah_dipakai", cellIds: used.map((cell) => cell.id) };
  const already = selected.filter((cell) => cell.kavlingId);
  if (already.length) return { ok: false, reason: "sudah_kavling", cellIds: already.map((cell) => cell.id) };
  if (!areAdjacent(selected)) return { ok: false, reason: "tidak_bersambung" };
  if (!(await jenisMakamBelongsToLokasi(deps, by, lokasiId, parsed.data.jenisMakamId))) return { ok: false, reason: "jenis_makam_tidak_ditemukan" };

  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, blokId);
    await lockLokasiInventory(tx, lokasiId);
    const nomorKavling =
      parsed.data.nomorKavling?.replace(/\s+/g, " ") ??
      (await nextFreeKavlingNumber(tx, lokasiId, kavlingPatternFrom(blok.numberPattern)));
    const conflicts = await conflictingNomorKavling(tx, lokasiId, [nomorKavling]);
    if (conflicts.length) return { ok: false as const, reason: "nomor_sudah_dipakai" as const, conflicts };

    const [kavlingRow] = await tx
      .insert(inventoryKavling)
      .values({
        blokId,
        lokasiId,
        nomorKavling,
        nomorKavlingKey: foldKey(nomorKavling),
        jenisMakamId: parsed.data.jenisMakamId,
        createdAt: now,
        createdByAccountId: by.accountId,
      })
      .returning();
    for (const cell of selected) {
      await tx.update(inventoryPetak).set({ kavlingId: kavlingRow.id }).where(eq(inventoryPetak.id, cell.id));
    }
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.buat_kavling",
      entity: { kind: "denah_kavling", id: kavlingRow.id },
      lokasiId,
      before: null,
      after: { nomorKavling, jenisMakamId: parsed.data.jenisMakamId, cellIds: selected.map((cell) => cell.id) },
      reason: null,
    });
    return { ok: true as const, kavlingId: kavlingRow.id, nomorKavling };
  });
}

/** The next free Nomor Kavling from `pattern` (from n = 1); unlike Nomor Makam this only ever needs one at a time. */
async function nextFreeKavlingNumber(db: Database, lokasiId: string, pattern: string): Promise<string> {
  for (let n = 1; n < 10_000; n++) {
    const candidate = numberFromPattern(pattern, n);
    const [conflict] = await conflictingNomorKavling(db, lokasiId, [candidate]);
    if (!conflict) return candidate;
  }
  throw new Error("No free Nomor Kavling found");
}

export type SplitKavlingResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "kavling_tidak_ditemukan" }
  | { ok: false; reason: "punya_hak_pakai" };

/** Splits a Kavling Keluarga back into its separate Petak Makam; refused once it has a Hak Pakai (spec, Inventory > Denah). */
export async function splitKavling(deps: InventoryDeps, by: Actor, lokasiId: string, kavlingId: string): Promise<SplitKavlingResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  if (!z.uuid().safeParse(kavlingId).success) return { ok: false, reason: "kavling_tidak_ditemukan" };

  const [row] = await deps.db.select().from(inventoryKavling).where(eq(inventoryKavling.id, kavlingId));
  if (!row || row.lokasiId !== lokasiId) return { ok: false, reason: "kavling_tidak_ditemukan" };
  if (row.firstUsedAt) return { ok: false, reason: "punya_hak_pakai" };

  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    await lockBlok(tx, row.blokId);
    await tx.update(inventoryPetak).set({ kavlingId: null }).where(eq(inventoryPetak.kavlingId, kavlingId));
    await tx.delete(inventoryKavling).where(eq(inventoryKavling.id, kavlingId));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "denah.pisahkan_kavling",
      entity: { kind: "denah_kavling", id: kavlingId },
      lokasiId,
      before: { nomorKavling: row.nomorKavling, jenisMakamId: row.jenisMakamId },
      after: null,
      reason: null,
    });
    return { ok: true as const };
  });
}

export type { CellRow };
