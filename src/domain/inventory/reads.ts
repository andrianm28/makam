import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { availability, type AvailabilityCount } from "./availability";
import { findBlok, isUsed, loadBloks, loadCells, loadKavlingByBlok, type BlokRecord, type CellRow, type KavlingRow } from "./grid";
import {
  currentHakPakaiOfKavling,
  currentHakPakaiOfPetak,
  currentPemegangHak,
  forStatus,
  hakPakaiByTarget,
  pemakamanOfHakPakai,
  petakIdsWithPemakaman,
  type HakPakaiRow,
  type PemakamanRow,
} from "./hak-pakai-reads";
import { findPetakByNomor, type PetakByNomor } from "./lookup";
import { blokPhotoUrl } from "./photo";
import { deriveKavlingStatus, derivePetakStatus, type KavlingStatus, type PetakStatus } from "./status";

/** A Denah cell as staff read it: its position, kind, derived status and "used" state. */
export interface DenahCell extends CellRow {
  usedForever: boolean;
  /** Only meaningful for a `"petak"` cell that is not part of a Kavling Keluarga (a member cell's status is its Kavling's). */
  status: PetakStatus;
}

export interface DenahKavling extends KavlingRow {
  cellIds: string[];
  status: KavlingStatus;
}

export interface BlokDenah {
  blok: BlokRecord;
  cells: DenahCell[];
  kavling: DenahKavling[];
}

/** A Hak Pakai's detail, as staff read it (its Pemegang Hak and every Pemakaman it covers). */
export interface HakPakaiDetail extends HakPakaiRow {
  pemegangHak: { name: string | null; phoneNumber: string | null; email: string | null } | null;
  pemakaman: PemakamanRow[];
}

async function hakPakaiDetailOf(db: InventoryDeps["db"], hakPakai: HakPakaiRow | null): Promise<HakPakaiDetail | null> {
  if (!hakPakai) return null;
  const [pemegangHak, pemakaman] = await Promise.all([currentPemegangHak(db, hakPakai.id), pemakamanOfHakPakai(db, hakPakai.id)]);
  return { ...hakPakai, pemegangHak: pemegangHak ? { name: pemegangHak.name, phoneNumber: pemegangHak.phoneNumber, email: pemegangHak.email } : null, pemakaman };
}

export interface StaffInventoryReads {
  /** Every Blok of a Lokasi Mitra this actor may see, by name. */
  bloks(lokasiId: string): Promise<BlokRecord[]>;
  /** One Blok's full grid and its Kavling Keluarga; null when it names no Blok this actor may see. */
  blok(lokasiId: string, blokId: string): Promise<BlokDenah | null>;
  /** A Blok's site-plan photo as a short-lived signed URL, or null (none uploaded, or the FileStore can't serve it). */
  photoUrl(lokasiId: string, blokId: string): Promise<string | null>;
  /** Every Jenis Makam's count of cleared Tersedia units at this Lokasi Mitra (a Kavling Keluarga counts as one). */
  availability(lokasiId: string): Promise<AvailabilityCount[]>;
  /** The Petak named `nomor` at this Lokasi Mitra, by its current Nomor Makam or an earlier (renumbered) one. */
  findPetak(lokasiId: string, nomor: string): Promise<PetakByNomor | null>;
  /** The current Hak Pakai of a Petak, with its Pemegang Hak and every Pemakaman; null when it has none. */
  hakPakaiOfPetak(lokasiId: string, petakId: string): Promise<HakPakaiDetail | null>;
  /** The current Hak Pakai of a Kavling Keluarga; see `hakPakaiOfPetak`. */
  hakPakaiOfKavling(lokasiId: string, kavlingId: string): Promise<HakPakaiDetail | null>;
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
      const [cells, kavlingMap, { byPetak, byKavling }] = await Promise.all([
        loadCells(deps.db, blokId),
        loadKavlingByBlok(deps.db, blokId),
        hakPakaiByTarget(deps.db, lokasiId),
      ]);
      const cellsByKavling = new Map<string, string[]>();
      for (const cell of cells) {
        if (!cell.kavlingId) continue;
        cellsByKavling.set(cell.kavlingId, [...(cellsByKavling.get(cell.kavlingId) ?? []), cell.id]);
      }
      const withPemakaman = await petakIdsWithPemakaman(
        deps.db,
        cells.filter((cell) => cell.kavlingId).map((cell) => cell.id),
      );
      return {
        blok,
        cells: cells.map((cell) => ({
          ...cell,
          usedForever: isUsed(cell, kavlingMap),
          status: derivePetakStatus({ tidakTersediaReason: cell.tidakTersediaReason, hakPakai: forStatus(byPetak.get(cell.id) ?? null) }),
        })),
        kavling: [...kavlingMap.values()].map((kavling) => {
          const memberIds = cellsByKavling.get(kavling.id) ?? [];
          const petakWithPemakaman = memberIds.filter((id) => withPemakaman.has(id)).length;
          return {
            ...kavling,
            cellIds: memberIds,
            status: deriveKavlingStatus({ hakPakai: forStatus(byKavling.get(kavling.id) ?? null), totalPetak: memberIds.length, petakWithPemakaman }),
          };
        }),
      };
    },
    async photoUrl(lokasiId, blokId) {
      if (!canSee(by, lokasiId)) return null;
      return blokPhotoUrl(deps, lokasiId, blokId);
    },
    async availability(lokasiId) {
      if (!canSee(by, lokasiId)) return [];
      return availability(deps.db, lokasiId);
    },
    async findPetak(lokasiId, nomor) {
      if (!canSee(by, lokasiId)) return null;
      return findPetakByNomor(deps.db, lokasiId, nomor);
    },
    async hakPakaiOfPetak(lokasiId, petakId) {
      if (!canSee(by, lokasiId)) return null;
      return hakPakaiDetailOf(deps.db, await currentHakPakaiOfPetak(deps.db, petakId));
    },
    async hakPakaiOfKavling(lokasiId, kavlingId) {
      if (!canSee(by, lokasiId)) return null;
      return hakPakaiDetailOf(deps.db, await currentHakPakaiOfKavling(deps.db, kavlingId));
    },
  };
}
