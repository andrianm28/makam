import { and, eq, inArray, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import type { Database } from "@/db/client";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { findBlok, isUsed, type BlokRecord, loadCells, loadKavlingByBlok } from "./grid";
import { lockBlok, lockLokasiInventory, lockTahan } from "./locks";
import { inventoryBlok, inventoryHakPakai, inventoryKavling, inventoryPetak, inventoryPetakAlias, inventoryPlotHold } from "./schema";

/** Why a Blok may not be removed: it has history, or an order is holding one of its plots right now. */
export type HalanganHapusBlok = "punya_riwayat" | "sedang_dipesan";

export type BolehHapusBlok = { boleh: true } | { boleh: false; reason: HalanganHapusBlok | "blok_tidak_ditemukan" | WriteRefusal["reason"] };

export type HapusBlokResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "blok_tidak_ditemukan" }
  | { ok: false; reason: "alasan_wajib" }
  | { ok: false; reason: HalanganHapusBlok };

/** The longest reason "Hapus Blok" keeps in the Audit Log: the action's schema, the domain and the dialog's input all use this one number. */
export const ALASAN_HAPUS_BLOK_MAX = 300;

const alasanSchema = z.string().trim().min(1).max(ALASAN_HAPUS_BLOK_MAX);

/** Whether any row of `table` (of this Lokasi when a Lokasi column is given) points at one of `ids` through `column`. */
async function adaYangMenunjuk(db: Database, table: PgTable, column: PgColumn, ids: string[], dalamLokasi?: { column: PgColumn; id: string }): Promise<boolean> {
  if (ids.length === 0) return false;
  const where = dalamLokasi ? and(eq(dalamLokasi.column, dalamLokasi.id), inArray(column, ids)) : inArray(column, ids);
  const rows = await db.select({ one: sql`1` }).from(table).where(where).limit(1);
  return rows.length > 0;
}

/**
 * What stops a Blok being removed, or null when it is empty of history: every
 * Petak Makam only ever Tersedia, Tidak Tersedia or not yet cleared, never in
 * a Hak Pakai, a Pemakaman, an earlier Nomor Makam or any Pemesanan (even a
 * released or cancelled one), and no Petak or Kavling Keluarga of it held by
 * an order right now.
 */
async function halangan(deps: InventoryDeps, db: Database, lokasiId: string, blokId: string): Promise<HalanganHapusBlok | null> {
  const [cells, kavling] = await Promise.all([loadCells(db, blokId), loadKavlingByBlok(db, blokId)]);
  const petakIds = cells.map((cell) => cell.id);
  const kavlingIds = [...kavling.keys()];
  if (cells.some((cell) => cell.kind === "petak" && isUsed(cell, kavling))) return "punya_riwayat";
  if ([...kavling.values()].some((row) => row.firstUsedAt)) return "punya_riwayat";

  const [hakPakaiPetak, hakPakaiKavling, alias, pernahDipesan] = await Promise.all([
    adaYangMenunjuk(db, inventoryHakPakai, inventoryHakPakai.petakId, petakIds),
    adaYangMenunjuk(db, inventoryHakPakai, inventoryHakPakai.kavlingId, kavlingIds),
    adaYangMenunjuk(db, inventoryPetakAlias, inventoryPetakAlias.petakId, petakIds),
    deps.pemesananPernahMenyebut(db, { petakIds, kavlingIds }),
  ]);
  if (hakPakaiPetak || hakPakaiKavling || alias || pernahDipesan) return "punya_riwayat";

  const dalamLokasi = { column: inventoryPlotHold.lokasiId, id: lokasiId };
  const [holdPetak, holdKavling] = await Promise.all([
    adaYangMenunjuk(db, inventoryPlotHold, inventoryPlotHold.petakId, petakIds, dalamLokasi),
    adaYangMenunjuk(db, inventoryPlotHold, inventoryPlotHold.kavlingId, kavlingIds, dalamLokasi),
  ]);
  return holdPetak || holdKavling ? "sedang_dipesan" : null;
}

/** The checks every entry point shares: this Lokasi's Admin Lokasi, and a Blok that exists here. */
async function periksaBlok(
  deps: InventoryDeps,
  by: Actor,
  lokasiId: string,
  blokId: string,
): Promise<{ blok: BlokRecord } | { refusal: WriteRefusal | { ok: false; reason: "blok_tidak_ditemukan" } }> {
  const refusal = writeRefusal(by, "denah.ubah", lokasiMitraResource(lokasiId));
  if (refusal) return { refusal };
  const blok = await findBlok(deps.db, lokasiId, blokId);
  return blok ? { blok } : { refusal: { ok: false, reason: "blok_tidak_ditemukan" } };
}

/** Whether this actor may remove this Blok right now, and if not why not: what the Denah editor decides "Hapus Blok" is shown on. */
export async function bolehHapusBlok(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string): Promise<BolehHapusBlok> {
  const found = await periksaBlok(deps, by, lokasiId, blokId);
  if ("refusal" in found) return { boleh: false, reason: found.refusal.reason };
  const stops = await halangan(deps, deps.db, lokasiId, blokId);
  return stops ? { boleh: false, reason: stops } : { boleh: true };
}

/**
 * Removes a Blok that is empty of history (see `halangan`), its Petak Makam,
 * its Kavling Keluarga and its site-plan photo, audited on the Lokasi with the
 * reason. Refused, saying why, for a Blok with any history or an order holding
 * one of its plots.
 */
export async function hapusBlok(deps: InventoryDeps, by: Actor, lokasiId: string, blokId: string, alasan: string): Promise<HapusBlokResult> {
  const found = await periksaBlok(deps, by, lokasiId, blokId);
  if ("refusal" in found) return found.refusal;
  const { blok } = found;
  const reason = alasanSchema.safeParse(alasan);
  if (!reason.success) return { ok: false, reason: "alasan_wajib" };

  return deps.audit
    .staffWrite(deps.db, async (tx, record) => {
      await lockBlok(tx, blokId);
      await lockLokasiInventory(tx, lokasiId);
      await lockTahan(tx, lokasiId);
      const stops = await halangan(deps, tx, lokasiId, blokId);
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
