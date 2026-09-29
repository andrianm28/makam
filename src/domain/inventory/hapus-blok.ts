import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { findBlok, isUsed, loadCells, loadKavlingByBlok } from "./grid";
import { lockBlok, lockLokasiInventory, lockTahan } from "./locks";
import { inventoryBlok, inventoryHakPakai, inventoryKavling, inventoryPetak, inventoryPetakAlias, inventoryPlotHold } from "./schema";

/** Why a Blok may not be removed: it has history, or an order is holding one of its plots right now. */
export type HalanganHapusBlok = "punya_riwayat" | "sedang_dipesan";

export type BolehHapusBlok = { boleh: true } | { boleh: false; reason: HalanganHapusBlok } | { boleh: false; reason: "blok_tidak_ditemukan" } | (WriteRefusal & { boleh: false });

export type HapusBlokResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "blok_tidak_ditemukan" }
  | { ok: false; reason: "alasan_wajib" }
  | { ok: false; reason: HalanganHapusBlok };

/**
 * What stops a Blok being removed, or null when it is empty of history: every
 * Petak Makam only ever Tersedia, Tidak Tersedia or not yet cleared, never in
 * a Hak Pakai, a Pemakaman or an earlier Nomor Makam, and no Petak or Kavling
 * Keluarga of it held by an order.
 */
async function halangan(db: Database, lokasiId: string, blokId: string): Promise<HalanganHapusBlok | null> {
  const [cells, kavling] = await Promise.all([loadCells(db, blokId), loadKavlingByBlok(db, blokId)]);
  const petakIds = cells.map((cell) => cell.id);
  const kavlingIds = [...kavling.keys()];
  if (cells.some((cell) => cell.kind === "petak" && isUsed(cell, kavling))) return "punya_riwayat";
  if ([...kavling.values()].some((row) => row.firstUsedAt)) return "punya_riwayat";

  if (petakIds.length > 0) {
    const [hakPakaiPetak, alias, holdPetak] = await Promise.all([
      db.select({ id: inventoryHakPakai.id }).from(inventoryHakPakai).where(inArray(inventoryHakPakai.petakId, petakIds)).limit(1),
      db.select({ id: inventoryPetakAlias.id }).from(inventoryPetakAlias).where(inArray(inventoryPetakAlias.petakId, petakIds)).limit(1),
      db.select({ id: inventoryPlotHold.id }).from(inventoryPlotHold).where(and(eq(inventoryPlotHold.lokasiId, lokasiId), inArray(inventoryPlotHold.petakId, petakIds))).limit(1),
    ]);
    if (hakPakaiPetak.length > 0 || alias.length > 0) return "punya_riwayat";
    if (holdPetak.length > 0) return "sedang_dipesan";
  }
  if (kavlingIds.length > 0) {
    const [hakPakaiKavling, holdKavling] = await Promise.all([
      db.select({ id: inventoryHakPakai.id }).from(inventoryHakPakai).where(inArray(inventoryHakPakai.kavlingId, kavlingIds)).limit(1),
      db.select({ id: inventoryPlotHold.id }).from(inventoryPlotHold).where(and(eq(inventoryPlotHold.lokasiId, lokasiId), inArray(inventoryPlotHold.kavlingId, kavlingIds))).limit(1),
    ]);
    if (hakPakaiKavling.length > 0) return "punya_riwayat";
    if (holdKavling.length > 0) return "sedang_dipesan";
  }
  return null;
}

/** Whether this actor may remove this Blok right now, and if not why not: what the Denah editor decides "Hapus Blok" is shown on. */
export async function bolehHapusBlok(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string): Promise<BolehHapusBlok> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return { boleh: false, ...refusal };
  if (!(await findBlok(deps.db, lokasiId, blokId))) return { boleh: false, reason: "blok_tidak_ditemukan" };
  const stops = await halangan(deps.db, lokasiId, blokId);
  return stops ? { boleh: false, reason: stops } : { boleh: true };
}

/**
 * Removes a Blok that is empty of history (see `halangan`), its Petak Makam,
 * its Kavling Keluarga and its site-plan photo, audited on the Lokasi with the
 * reason. Refused, saying why, for a Blok with any history or an order holding
 * one of its plots.
 */
export async function hapusBlok(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, alasan: string): Promise<HapusBlokResult> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const reason = z.string().trim().min(1).max(300).safeParse(alasan);
  if (!reason.success) return { ok: false, reason: "alasan_wajib" };
  const blok = await findBlok(deps.db, lokasiId, blokId);
  if (!blok) return { ok: false, reason: "blok_tidak_ditemukan" };

  return deps.audit
    .staffWrite(deps.db, async (tx, record) => {
      await lockBlok(tx, blokId);
      await lockLokasiInventory(tx, lokasiId);
      await lockTahan(tx, lokasiId);
      const stops = await halangan(tx, lokasiId, blokId);
      if (stops) return { ok: false as const, reason: stops };

      await tx.delete(inventoryPetak).where(eq(inventoryPetak.blokId, blokId));
      await tx.delete(inventoryKavling).where(eq(inventoryKavling.blokId, blokId));
      await tx.delete(inventoryBlok).where(and(eq(inventoryBlok.id, blokId), eq(inventoryBlok.lokasiId, lokasiId)));
      await record({
        actor: { accountId: by.accountId, role: "admin_lokasi" },
        action: "denah.hapus_blok",
        entity: { kind: "denah_blok", id: blokId },
        lokasiId,
        before: { name: blok.name, numberPattern: blok.numberPattern, rows: blok.rows, cols: blok.cols },
        after: null,
        reason: reason.data,
      });
      return { ok: true as const };
    })
    .then(async (result) => {
      // Best-effort: the photo is no longer referenced. Never blocks the write above.
      if (result.ok && blok.photoFileKey) await deps.files.delete(blok.photoFileKey).catch(() => undefined);
      return result;
    });
}
