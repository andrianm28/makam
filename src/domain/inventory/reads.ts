import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { authorize, lokasiMitraResource, type Actor } from "@/domain/identity";
import type { InventoryDeps } from "./deps";
import { availability, type AvailabilityCount } from "./availability";
import { findBlok, isUsed, loadBloks, loadCells, loadKavlingByBlok, type BlokRecord, type CellRow, type KavlingRow } from "./grid";
import { inventoryHakPakai, inventoryPetak } from "./schema";
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
import { deriveKavlingStatus, derivePetakStatus, type HakPakaiStatus, type KavlingStatus, type PetakStatus } from "./status";
import { inventoryKavling } from "./schema";
import { wibDateOf } from "@/lib/time/jakarta";

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

/** A `inventory_hak_pakai` row as the module's own reads keep it. */
function toHakPakaiRow(row: typeof inventoryHakPakai.$inferSelect): HakPakaiRow {
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

/**
 * One Hak Pakai by its id, with its current Pemegang Hak and its Pemakaman, or
 * null. No actor, and deliberately so: what a reader may see here is a document
 * the Pemesanan module issues (a Bukti Pemesanan names the holder and the term),
 * and the modules that call it are given the id by the order that owns the plot.
 * Every staff screen reads a Hak Pakai through `asStaff(by).hakPakaiOfPetak`.
 */
export async function hakPakaiById(deps: { db: InventoryDeps["db"] }, hakPakaiId: string): Promise<HakPakaiDetail | null> {
  if (!z.uuid().safeParse(hakPakaiId).success) return null;
  const [row] = await deps.db.select().from(inventoryHakPakai).where(eq(inventoryHakPakai.id, hakPakaiId));
  return hakPakaiDetailOf(deps.db, row ? toHakPakaiRow(row) : null);
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

/**
 * One grave's current Hak Pakai, as the rule that gates a Layanan order needs
 * it: its status, whether the Admin Lokasi still has to complete it, and the
 * number the Lokasi and the family both know it by. No actor, and deliberately
 * without the Pemegang Hak: a relative may order Layanan for a grave whose
 * holder is somebody else, so what the caller gets is the state of the right,
 * never the person who holds it.
 */
export interface HakPakaiUntukUnit {
  id: string;
  lokasiId: string;
  /** The unit's own number: the Petak's Nomor Makam, or the Kavling Keluarga's. */
  nomor: string | null;
  status: HakPakaiStatus;
  /** An imported or "data menyusul" Hak Pakai the Admin Lokasi has not completed yet. */
  perluVerifikasi: boolean;
  /** Its end date as a WIB calendar date, or null while perpetual or before the tenure clock started. */
  tanggalBerakhir: string | null;
}

/**
 * The current Hak Pakai of a Petak Makam, or of a Kavling Keluarga, with its own
 * number; null when the unit holds none.
 *
 * The number travels here rather than being read off the public Denah because that
 * Denah is the *picker's*: it shows the units a family may still choose, so a grave
 * somebody already holds is not in it. An order is placed for exactly those graves.
 */
export async function hakPakaiOfUnit(deps: { db: InventoryDeps["db"] }, unit: { petakId: string } | { kavlingId: string }): Promise<HakPakaiUntukUnit | null> {
  const petak = "petakId" in unit;
  const hakPakai = petak ? await currentHakPakaiOfPetak(deps.db, unit.petakId) : await currentHakPakaiOfKavling(deps.db, unit.kavlingId);
  if (!hakPakai) return null;
  const [unitRow] = petak
    ? await deps.db.select({ nomor: inventoryPetak.nomorMakam }).from(inventoryPetak).where(eq(inventoryPetak.id, unit.petakId))
    : await deps.db.select({ nomor: inventoryKavling.nomorKavling }).from(inventoryKavling).where(eq(inventoryKavling.id, unit.kavlingId));
  return {
    id: hakPakai.id,
    lokasiId: hakPakai.lokasiId,
    nomor: unitRow?.nomor ?? null,
    status: hakPakai.status,
    perluVerifikasi: hakPakai.perluVerifikasi,
    tanggalBerakhir: hakPakai.endDate === null ? null : wibDateOf(hakPakai.endDate),
  };
}

/**
 * Whether any Petak Makam at this Lokasi Mitra still needs the Admin
 * Lokasi's clearing (Perlu Verifikasi). No actor: the Terencana switch's own
 * fact (ticket 16), read by the caller composing the Lokasi module's write.
 */
export async function hasPetakPerluVerifikasi(deps: { db: InventoryDeps["db"] }, lokasiId: string): Promise<boolean> {
  return (await jumlahPetakPerluVerifikasi(deps, lokasiId)) > 0;
}

/**
 * How many Petak Makam of a Lokasi Mitra still need clearing (Perlu
 * Verifikasi): what the Antrean Lokasi's "Petak Perlu Verifikasi" row counts
 * (ticket 23). No actor: the same fact as `hasPetakPerluVerifikasi`, counted.
 */
export async function jumlahPetakPerluVerifikasi(deps: { db: InventoryDeps["db"] }, lokasiId: string): Promise<number> {
  const [row] = await deps.db
    .select({ n: count() })
    .from(inventoryPetak)
    .where(and(eq(inventoryPetak.lokasiId, lokasiId), eq(inventoryPetak.kind, "petak"), eq(inventoryPetak.perluVerifikasi, true)));
  return row?.n ?? 0;
}
