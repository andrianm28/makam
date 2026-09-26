import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { findBlok, isUsed, loadBloks, loadCells, loadKavlingByBlok, type BlokRecord, type CellRow, type KavlingRow } from "./grid";
import { blokPhotoUrl } from "./photo";

/** A Denah cell as staff read it: its position, kind, and (for a Petak) its derived "used" state. */
export interface DenahCell extends CellRow {
  usedForever: boolean;
}

export interface DenahKavling extends KavlingRow {
  cellIds: string[];
}

export interface BlokDenah {
  blok: BlokRecord;
  cells: DenahCell[];
  kavling: DenahKavling[];
}

export interface StaffInventoryReads {
  /** Every Blok of a Lokasi Mitra this actor may see, by name. */
  bloks(lokasiId: string): Promise<BlokRecord[]>;
  /** One Blok's full grid and its Kavling Keluarga; null when it names no Blok this actor may see. */
  blok(lokasiId: string, blokId: string): Promise<BlokDenah | null>;
  /** A Blok's site-plan photo as a short-lived signed URL, or null (none uploaded, or the FileStore can't serve it). */
  photoUrl(lokasiId: string, blokId: string): Promise<string | null>;
}

function canSee(by: Actor, lokasiId: string): boolean {
  return authorize(by, "denah.lihat", lokasiMitraResource(lokasiId)).allowed;
}

export function staffInventoryReads(deps: InventoryDeps, by: Actor): StaffInventoryReads {
  return {
    async bloks(lokasiId) {
      if (!canSee(by, lokasiId)) return [];
      return loadBloks(deps.db, lokasiId);
    },
    async blok(lokasiId, blokId) {
      if (!canSee(by, lokasiId)) return null;
      const blok = await findBlok(deps.db, lokasiId, blokId);
      if (!blok) return null;
      const [cells, kavlingMap] = await Promise.all([loadCells(deps.db, blokId), loadKavlingByBlok(deps.db, blokId)]);
      const cellsByKavling = new Map<string, string[]>();
      for (const cell of cells) {
        if (!cell.kavlingId) continue;
        cellsByKavling.set(cell.kavlingId, [...(cellsByKavling.get(cell.kavlingId) ?? []), cell.id]);
      }
      return {
        blok,
        cells: cells.map((cell) => ({ ...cell, usedForever: isUsed(cell, kavlingMap) })),
        kavling: [...kavlingMap.values()].map((kavling) => ({ ...kavling, cellIds: cellsByKavling.get(kavling.id) ?? [] })),
      };
    },
    async photoUrl(lokasiId, blokId) {
      if (!canSee(by, lokasiId)) return null;
      return blokPhotoUrl(deps, lokasiId, blokId);
    },
  };
}
