/**
 * Inventory (spec, domain module 5, Lokasi Mitra only): the Denah (a grid per
 * Blok of Petak Makam, Jalan and Bukan Petak cells, and Kavling Keluarga —
 * ticket 13), Hak Pakai / Pemegang Hak / Pemakaman and the Petak clearing
 * flow (ticket 14), derived Petak / Kavling status and availability, and
 * Petak renumbering with a hidden alias for old numbers.
 *
 * Owns tables: inventory_blok, inventory_petak, inventory_kavling,
 * inventory_hak_pakai, inventory_pemegang_hak, inventory_pemakaman,
 * inventory_petak_alias.
 *
 * Every write is a staff write: it records an Entri Audit through the Audit
 * Log module in the same transaction, on the Lokasi Mitra it belongs to, and
 * re-checks `authorize` itself (`denah.ubah` for that Lokasi's Admin Lokasi;
 * `petak.nomor_ulang` for Admin Platform only). Reads (`denah.lihat`) also
 * serve Admin Platform.
 */
import type { Actor } from "@/domain/identity";
import type { AvailabilityCount } from "./availability";
import { createBlok, MAX_BLOK_DIMENSION, type CreateBlokResult, type NewBlokInput } from "./blok";
import { setCellKind, setJenisMakam, renumberCells, setSingleNumber } from "./cells";
import type { BulkEditOutcome, RenumberInput, SetCellKindInput, SetCellKindResult, SetJenisMakamInput, SetJenisMakamResult, RenumberResult, SetSingleNumberResult } from "./cells";
import { clearKavling, clearPetak, kavlingClearingSchema, petakClearingSchema, type ClearingResult, type ClearKavlingResult } from "./clearing";
import type { InventoryDeps } from "./deps";
import type { PetakByNomor } from "./lookup";
import { createKavling, splitKavling, type CreateKavlingResult, type NewKavlingInput, type SplitKavlingResult } from "./kavling";
import { uploadBlokPhoto, type UploadBlokPhotoResult, BLOK_PHOTO_MAX_BYTES } from "./photo";
import { renumberPetak, type RenumberPetakResult } from "./renumber";
import {
  hasPetakPerluVerifikasi,
  staffInventoryReads,
  type BlokDenah,
  type DenahCell,
  type DenahKavling,
  type HakPakaiDetail,
  type StaffInventoryReads,
} from "./reads";
import { addEdge, removeRowsOrCols, edges, type AddEdgeResult, type Edge, type RemoveRowsOrColsInput, type RemoveRowsOrColsResult } from "./resize";
import { isValidPattern, kavlingPatternFrom, numberFromPattern } from "./numbering";
import type { HakPakaiStatus, KavlingStatus, PetakStatus } from "./status";

export type { InventoryDeps } from "./deps";
export type { BlokRecord, CellRow, KavlingRow, PetakKind } from "./grid";
export { inventoryPetakKinds, inventoryHakPakaiStatuses } from "./schema";
export type { BulkEditOutcome, NewBlokInput, NewKavlingInput, RenumberInput, SetCellKindInput, SetJenisMakamInput };
export type { ClearingInput, NewPemakaman, NewPemegangHak } from "./clearing";
export type {
  AddEdgeResult,
  AvailabilityCount,
  BlokDenah,
  ClearingResult,
  ClearKavlingResult,
  CreateBlokResult,
  CreateKavlingResult,
  DenahCell,
  DenahKavling,
  Edge,
  HakPakaiDetail,
  HakPakaiStatus,
  KavlingStatus,
  PetakByNomor,
  PetakStatus,
  RemoveRowsOrColsInput,
  RemoveRowsOrColsResult,
  RenumberPetakResult,
  RenumberResult,
  SetCellKindResult,
  SetJenisMakamResult,
  SetSingleNumberResult,
  SplitKavlingResult,
  StaffInventoryReads,
  UploadBlokPhotoResult,
};
export { MAX_BLOK_DIMENSION, BLOK_PHOTO_MAX_BYTES, edges as denahEdges, isValidPattern, kavlingPatternFrom, numberFromPattern };
export { kavlingClearingSchema, petakClearingSchema };

export interface Inventory {
  /** Reads scoped to this actor (Admin Platform sees every Lokasi Mitra; an Admin Lokasi only its own). */
  asStaff(by: Actor): StaffInventoryReads;
  /** An Admin Lokasi creates a Blok on its own Lokasi's Denah. */
  createBlok(by: Actor, lokasiId: string, input: NewBlokInput): Promise<CreateBlokResult>;
  /** Bulk-turns selected Denah cells into Petak Makam, Jalan or Bukan Petak. */
  setCellKind(by: Actor, lokasiId: string, blokId: string, input: SetCellKindInput): Promise<SetCellKindResult>;
  /** Bulk-sets the Jenis Makam of selected Petak Makam. */
  setJenisMakam(by: Actor, lokasiId: string, blokId: string, input: SetJenisMakamInput): Promise<SetJenisMakamResult>;
  /** Bulk-renumbers selected Petak Makam in reading order from a pattern. */
  renumberCells(by: Actor, lokasiId: string, blokId: string, input: RenumberInput): Promise<RenumberResult>;
  /** Sets one Petak Makam's Nomor Makam. */
  setSingleNumber(by: Actor, lokasiId: string, blokId: string, cellId: string, nomorMakam: string): Promise<SetSingleNumberResult>;
  /** Groups adjacent Petak Makam into a Kavling Keluarga. */
  createKavling(by: Actor, lokasiId: string, blokId: string, input: NewKavlingInput): Promise<CreateKavlingResult>;
  /** Splits a Kavling Keluarga back into separate Petak Makam (refused once it has a Hak Pakai). */
  splitKavling(by: Actor, lokasiId: string, kavlingId: string): Promise<SplitKavlingResult>;
  /** Adds one row or column at the named edge. */
  addEdge(by: Actor, lokasiId: string, blokId: string, edge: Edge): Promise<AddEdgeResult>;
  /** Removes rows or columns, only when none of their Petak was ever used and none is part of a Kavling Keluarga. */
  removeRowsOrCols(by: Actor, lokasiId: string, blokId: string, input: RemoveRowsOrColsInput): Promise<RemoveRowsOrColsResult>;
  /** Uploads (or replaces) a Blok's site-plan photo; refused with `penyimpanan_belum_tersedia` while no FileStore is configured. */
  uploadBlokPhoto(by: Actor, lokasiId: string, blokId: string, file: { body: Uint8Array; contentType: string }): Promise<UploadBlokPhotoResult>;
  /** Clears one Petak Makam: Tersedia, Tidak Tersedia (with a reason) or occupied (a minimal Hak Pakai). */
  clearPetak(by: Actor, lokasiId: string, petakId: string, input: unknown): Promise<ClearingResult>;
  /** Clears a whole Kavling Keluarga the same way (its Hak Pakai, if any, covers every member Petak). */
  clearKavling(by: Actor, lokasiId: string, kavlingId: string, input: unknown): Promise<ClearKavlingResult>;
  /** Admin Platform renumbers a Petak Makam; its old Nomor Makam is kept as a hidden alias. */
  renumberPetak(by: Actor, lokasiId: string, petakId: string, nomorMakam: string): Promise<RenumberPetakResult>;
  /** Whether any Petak Makam here still needs clearing (Perlu Verifikasi); no actor, the Terencana switch's own fact (ticket 16). */
  hasPetakPerluVerifikasi(lokasiId: string): Promise<boolean>;
}

export function createInventory(deps: InventoryDeps): Inventory {
  return {
    asStaff: (by) => staffInventoryReads(deps, by),
    createBlok: (by, lokasiId, input) => createBlok(deps, by, lokasiId, input),
    setCellKind: (by, lokasiId, blokId, input) => setCellKind(deps, by, lokasiId, blokId, input),
    setJenisMakam: (by, lokasiId, blokId, input) => setJenisMakam(deps, by, lokasiId, blokId, input),
    renumberCells: (by, lokasiId, blokId, input) => renumberCells(deps, by, lokasiId, blokId, input),
    setSingleNumber: (by, lokasiId, blokId, cellId, nomorMakam) => setSingleNumber(deps, by, lokasiId, blokId, cellId, nomorMakam),
    createKavling: (by, lokasiId, blokId, input) => createKavling(deps, by, lokasiId, blokId, input),
    splitKavling: (by, lokasiId, kavlingId) => splitKavling(deps, by, lokasiId, kavlingId),
    addEdge: (by, lokasiId, blokId, edge) => addEdge(deps, by, lokasiId, blokId, edge),
    removeRowsOrCols: (by, lokasiId, blokId, input) => removeRowsOrCols(deps, by, lokasiId, blokId, input),
    uploadBlokPhoto: (by, lokasiId, blokId, file) => uploadBlokPhoto(deps, by, lokasiId, blokId, file),
    clearPetak: (by, lokasiId, petakId, input) => clearPetak(deps, by, lokasiId, petakId, input),
    clearKavling: (by, lokasiId, kavlingId, input) => clearKavling(deps, by, lokasiId, kavlingId, input),
    renumberPetak: (by, lokasiId, petakId, nomorMakam) => renumberPetak(deps, by, lokasiId, petakId, nomorMakam),
    hasPetakPerluVerifikasi: (lokasiId) => hasPetakPerluVerifikasi(deps, lokasiId),
  };
}
