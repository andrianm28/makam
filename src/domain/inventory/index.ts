/**
 * Inventory (spec, domain module 5, Lokasi Mitra only): the Denah (a grid per
 * Blok of Petak Makam, Jalan, Bukan Petak and Pintu Masuk cells, and Kavling
 * Keluarga — ticket 13), Hak Pakai / Pemegang Hak / Pemakaman and the Petak
 * clearing flow (ticket 14), the Terencana plot hold and its picker read
 * (ticket 36), the Pintu Masuk cell (ticket 84), derived Petak / Kavling status
 * and availability, and Petak renumbering with a hidden alias for old numbers.
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
import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { availability, type AvailabilityCount } from "./availability";
import { beriHakPakai, tersediaUntukJenisMakam, type BeriHakPakaiResult, type TersediaUnit } from "./beri-hak-pakai";
import { createBlok, MAX_BLOK_DIMENSION, type CreateBlokResult, type NewBlokInput } from "./blok";
import { cariMakam, makamPemegangHak, type HasilCariMakam, type MakamDitemukan, type PermintaanDariIP } from "./cari-makam";
import { catatPemakaman, type CatatPemakamanResult } from "./catat-pemakaman";
import { setCellKind, setJenisMakam, renumberCells, setSingleNumber } from "./cells";
import type { BulkEditOutcome, RenumberInput, SetCellKindInput, SetCellKindResult, SetJenisMakamInput, SetJenisMakamResult, RenumberResult, SetSingleNumberResult } from "./cells";
import { clearKavling, clearPetak, kavlingClearingSchema, petakClearingSchema, type ClearingResult, type ClearKavlingResult } from "./clearing";
import type { InventoryDeps } from "./deps";
import type { PetakByNomor } from "./lookup";
import { makamKeluargaSaya, type MakamSaya } from "./makam-saya";
import { createKavling, splitKavling, type CreateKavlingResult, type NewKavlingInput, type SplitKavlingResult } from "./kavling";
import { uploadBlokPhoto, type UploadBlokPhotoResult, BLOK_PHOTO_MAX_BYTES } from "./photo";
import { batalkanHakPakai, type BatalkanHakPakaiResult } from "./batalkan-hak-pakai";
import { akhiriHakPakai, type AkhiriHakPakaiResult } from "./akhiri-hak-pakai";
import {
  hakPakaiUntukPerpanjangan,
  lengkapiHakPakai,
  lengkapiHakPakaiSchema,
  perpanjangHakPakai,
  type HakPakaiUntukPerpanjangan,
  type LengkapiHakPakaiResult,
  type PerpanjangHakPakaiResult,
} from "./perpanjangan";
import { renumberPetak, type RenumberPetakResult } from "./renumber";
import {
  hasPetakPerluVerifikasi,
  jumlahPetakPerluVerifikasi,
  hakPakaiById,
  staffInventoryReads,
  type BlokDenah,
  type DenahCell,
  type DenahKavling,
  type HakPakaiDetail,
  type StaffInventoryReads,
} from "./reads";
import { addEdge, removeRowsOrCols, edges, type AddEdgeResult, type Edge, type RemoveRowsOrColsInput, type RemoveRowsOrColsResult } from "./resize";
import { isValidPattern, kavlingPatternFrom, numberFromPattern } from "./numbering";
import { publicDenah, tersediaUntukTerencana, type PublicDenah } from "./picker";
import { lepasTahan, tahan, type LepasTahanResult, type TahanInput, type TahanResult } from "./hold";
import {
  beriHakPakaiDariTahan,
  mulaiTahanBayar,
  type BeriHakPakaiDariTahanInput,
  type BeriHakPakaiDariTahanResult,
} from "./tahan-bayar";
import type { HakPakaiStatus, KavlingStatus, PetakStatus } from "./status";

export type { InventoryDeps } from "./deps";
export type { BlokRecord, CellRow, KavlingRow, PetakKind } from "./grid";
export { inventoryPetakKinds, inventoryHakPakaiStatuses } from "./schema";
export type { BulkEditOutcome, NewBlokInput, NewKavlingInput, RenumberInput, SetCellKindInput, SetJenisMakamInput };
export type { ClearingInput } from "./clearing";
export type { NewPemakaman, NewPemegangHak } from "./hak-pakai-grant";
export type { BeriHakPakaiDariTahanInput, BeriHakPakaiDariTahanResult, UnitDariTahan } from "./tahan-bayar";
export type { SyaratHakPakai } from "./schema";
import type { NewPemegangHak as NewPemegangHakInput } from "./hak-pakai-grant";
export type { BeriHakPakaiResult, TersediaUnit } from "./beri-hak-pakai";
export type { HakPakaiUntukPerpanjangan, LengkapiHakPakaiInput, LengkapiHakPakaiResult, PerpanjangHakPakaiResult } from "./perpanjangan";
export { lengkapiHakPakaiSchema };
export type { AkhiriHakPakaiResult } from "./akhiri-hak-pakai";
export type { BolehDitahanResult, LepasTahanResult, TahanInput, TahanResult, TahanUnit } from "./hold";
export { bolehDitahan } from "./hold";
export type { AturanTumpang, PilihanFacts, PilihanStatus, PublicDenah, PublicDenahBlok, PublicDenahCell, PublicDenahKavling } from "./picker";
export { pilihanOf } from "./picker";
export type { HasilCariMakam, MakamDitemukan, PetakDitemukan, PermintaanCariMakam, PermintaanDariIP } from "./cari-makam";
export { CARI_MAKAM_ATTEMPT_KEPT_MS, CARI_MAKAM_JENDELA_MENIT, CARI_MAKAM_MAKS_PER_IP, KUNCI_HASIL_CARI_MAKAM, pruneCariMakamAttempts } from "./cari-makam";
export type { MakamSaya, PetakMakamSaya } from "./makam-saya";
export type { PemakamanRow } from "./hak-pakai-reads";
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
export { addYears } from "./tenure";
export { MAX_BLOK_DIMENSION, BLOK_PHOTO_MAX_BYTES, edges as denahEdges, isValidPattern, kavlingPatternFrom, numberFromPattern };
export { kavlingClearingSchema, petakClearingSchema };
export { catatPemakamanSchema, type CatatPemakamanInput, type MasaHakPakai } from "./catat-pemakaman";

export interface Inventory {
  /** Reads scoped to this actor (Admin Platform sees every Lokasi Mitra; an Admin Lokasi only its own). */
  asStaff(by: Actor): StaffInventoryReads;
  /** An Admin Lokasi creates a Blok on its own Lokasi's Denah. */
  createBlok(by: Actor, lokasiId: string, input: NewBlokInput): Promise<CreateBlokResult>;
  /** Bulk-turns selected Denah cells into Petak Makam, Jalan, Bukan Petak or Pintu Masuk; a used cell is skipped and a held plot is never retyped. */
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
  /**
   * Records one Pemakaman on a Hak Pakai: the burial the Admin Lokasi made
   * (Almarhum, date, Petak, layer) and, when it is the first, the start of that
   * Hak Pakai's tenure clock with the fixed term's end date (ticket 25).
   */
  catatPemakaman(by: Actor, lokasiId: string, input: unknown): Promise<CatatPemakamanResult>;
  /**
   * One Hak Pakai by its id, with its current Pemegang Hak and its Pemakaman, or
   * null. No actor: it exists for the document that proves a right (a Bukti
   * Pemesanan), which the Pemesanan module reaches through the order that owns
   * the plot. Staff screens read a Hak Pakai through `asStaff`.
   */
  hakPakaiById(hakPakaiId: string): Promise<HakPakaiDetail | null>;
  /**
   * The Hak Pakai a Perpanjangan is about (ticket 40): status, its own term as
   * bought, end date, Perlu Verifikasi flag, Jenis Makam, Petak numbers and the
   * current Pemegang Hak with the recorded email. No actor: the caller is the
   * Perpanjangan module, which never shows the holder's details to the family.
   */
  hakPakaiUntukPerpanjangan(hakPakaiId: string): Promise<HakPakaiUntukPerpanjangan | null>;
  /**
   * Moves a Hak Pakai's end date by terms x its own term (never counted from the
   * payment) and makes a Kedaluwarsa one Aktif again. Driven by Perpanjangan
   * inside the transaction that settles its Tagihan (`within`); no actor.
   */
  perpanjangHakPakai(input: { hakPakaiId: string; terms: number }): Promise<PerpanjangHakPakaiResult>;
  /** The Admin Lokasi completes a Perlu Verifikasi Hak Pakai (end date, holder contact), audited (ticket 40). */
  lengkapiHakPakai(by: Actor, lokasiId: string, input: unknown): Promise<LengkapiHakPakaiResult>;
  /** Admin Platform renumbers a Petak Makam; its old Nomor Makam is kept as a hidden alias. */
  renumberPetak(by: Actor, lokasiId: string, petakId: string, nomorMakam: string): Promise<RenumberPetakResult>;
  /** Whether any Petak Makam here still needs clearing (Perlu Verifikasi); no actor, the Terencana switch's own fact (ticket 16). */
  hasPetakPerluVerifikasi(lokasiId: string): Promise<boolean>;
  /** How many Petak Makam here still need clearing (Perlu Verifikasi), for the Antrean Lokasi's row (ticket 23). */
  jumlahPetakPerluVerifikasi(lokasiId: string): Promise<number>;
  /**
   * Every cleared Tersedia Petak Makam of one Jenis Makam at this Lokasi Mitra,
   * by Nomor Makam: what a Saat Duka confirmation offers its Admin Lokasi, and
   * never a Petak of another Jenis Makam, one still Perlu Verifikasi, or one
   * already held (ticket 23). No actor.
   */
  tersediaUntukJenisMakam(lokasiId: string, jenisMakamId: string): Promise<TersediaUnit[]>;
  /**
   * Gives one cleared Tersedia Petak Makam to a Pemegang Hak: the Hak Pakai
   * Aktif a Saat Duka confirmation creates, audited on the Lokasi. Refused for
   * a Petak of another Jenis Makam, one not cleared Tersedia, or one the
   * caller may not confirm (that Lokasi's Admin Lokasi only).
   */
  beriHakPakai(by: Actor, lokasiId: string, input: { petakId: string; jenisMakamId: string; pemegangHak: NewPemegangHakInput }): Promise<BeriHakPakaiResult>;
  /**
   * One Aktif Hak Pakai with no Pemakaman under it becomes Dibatalkan, so the
   * Petak it held is `Tersedia` again (spec, Pemesanan > Saat Duka cancellation;
   * ticket 24). Driven by the order that owns the right, with no actor, as
   * `lepasTahan` is: a grave that has been dug is refused, and ending is final.
   */
  batalkanHakPakai(input: { hakPakaiId: string; alasan: string }): Promise<BatalkanHakPakaiResult>;
  /**
   * One Aktif Hak Pakai becomes Berakhir, once the Saat Duka Tagihan against
   * it is Tidak Tertagih (spec, Billing > Chasing; ticket 29). Driven by the
   * order that owns the right, with no actor: the caller has already checked
   * it is that Lokasi's own Admin Lokasi and that the Tagihan really is Tidak
   * Tertagih. Ending is final, the same as `batalkanHakPakai`.
   */
  akhiriHakPakai(input: { hakPakaiId: string; alasan: string }): Promise<AkhiriHakPakaiResult>;
  /** The same functions inside an open transaction (a Pemesanan Makam's confirmation), committing or rolling back with it. */
  within(tx: Database): Inventory;
  /**
   * The Denah the Terencana wizard's picker draws, each Petak Makam and Kavling
   * Keluarga saying whether it may be picked and why not; no actor, and null for
   * a Lokasi Mitra that is not listed with Pemesanan Terencana on.
   */
  publicDenah(lokasiId: string): Promise<PublicDenah | null>;
  /** How many units a Pemesan may pick at each of these Lokasi Mitra (a Kavling Keluarga counts as one); 0 for one not listed for Terencana. */
  tersediaUntukTerencana(lokasiIds: readonly string[]): Promise<Record<string, number>>;
  /**
   * Holds the chosen Petak Makam (or one whole Kavling Keluarga) for a
   * Pemesanan Terencana, all or nothing: refused, naming the first unit that is
   * no longer pickable, when any of them is, so two orders for one plot can never
   * both hold it. Take it `within` the order's own transaction.
   */
  tahan(input: TahanInput): Promise<TahanResult>;
  /** Releases every hold one order placed (its decline, withdrawal or lapse), so the plots sell again. */
  lepasTahan(nomorPemesanan: string): Promise<LepasTahanResult>;
  /**
   * Starts the payment hold of a confirmed Terencana order: every plot it holds is
   * held until `sampai`, the instant its pay-first Tagihan is due (ticket 37). No
   * actor: the order that owns the hold drives it, as `lepasTahan`.
   */
  mulaiTahanBayar(input: { nomorPemesanan: string; sampai: Date }): Promise<{ ok: true; ditahan: number }>;
  /**
   * A paid Terencana order's hold becomes the right it held: one Aktif Hak Pakai per
   * Petak Makam or Kavling Keluarga, one Pemegang Hak, each with the Syarat it was
   * bought under and the Calon Penghuni label, and the hold is released (ticket 37).
   * Take it `within` the payment's own transaction.
   */
  beriHakPakaiDariTahan(input: BeriHakPakaiDariTahanInput): Promise<BeriHakPakaiDariTahanResult>;
  /**
   * Where a grave is, for a family with no session: by Lokasi + Nomor Makam (the
   * current one or one it was renumbered from, which is never shown), by Lokasi
   * + Nomor Kavling, or by Lokasi + Almarhum name + year of death. Answers with
   * Almarhum names, numbers, Hak Pakai status and end date only — never the
   * Pemegang Hak's — and with the whole Kavling Keluarga when the match is one
   * of its Petak. Rate-limited per IP against enumeration.
   */
  cariMakam(input: PermintaanDariIP): Promise<HasilCariMakam>;
  /**
   * Every grave whose current Pemegang Hak recorded this email, at any Lokasi
   * Mitra: the Makam tab a signed-in Akun sees as shortcuts into the hub. An
   * email that is not an email, or holds nothing, is an empty list.
   */
  makamPemegangHak(input: { email: string }): Promise<MakamDitemukan[]>;
  /**
   * The same graves, for the Akun's own Makam Keluarga tab (ticket 27): the Hak
   * Pakai's own id and every Pemakaman it covers in full, which the public
   * lookup's privacy list forbids `makamPemegangHak` from carrying.
   */
  makamKeluargaSaya(input: { email: string }): Promise<MakamSaya[]>;
  /** The same module on another transaction, so a caller can place a hold and the order that needs it in one commit. */
  within(tx: Database): Inventory;
  /**
   * Every Jenis Makam's count of cleared Tersedia units at this Lokasi Mitra
   * (a Kavling Keluarga counts as one); no actor, for the listing that offers
   * only what is available.
   */
  tersediaPerJenisMakam(lokasiId: string): Promise<AvailabilityCount[]>;
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
    catatPemakaman: (by, lokasiId, input) => catatPemakaman(deps, by, lokasiId, input),
    hakPakaiById: (hakPakaiId) => hakPakaiById(deps, hakPakaiId),
    hakPakaiUntukPerpanjangan: (hakPakaiId) => hakPakaiUntukPerpanjangan(deps, hakPakaiId),
    perpanjangHakPakai: (input) => perpanjangHakPakai(deps, input),
    lengkapiHakPakai: (by, lokasiId, input) => lengkapiHakPakai(deps, by, lokasiId, input),
    renumberPetak: (by, lokasiId, petakId, nomorMakam) => renumberPetak(deps, by, lokasiId, petakId, nomorMakam),
    hasPetakPerluVerifikasi: (lokasiId) => hasPetakPerluVerifikasi(deps, lokasiId),
    jumlahPetakPerluVerifikasi: (lokasiId) => jumlahPetakPerluVerifikasi(deps, lokasiId),
    tersediaUntukJenisMakam: (lokasiId, jenisMakamId) => tersediaUntukJenisMakam(deps, lokasiId, jenisMakamId),
    beriHakPakai: (by, lokasiId, input) => beriHakPakai(deps, by, lokasiId, input),
    batalkanHakPakai: (input) => batalkanHakPakai(deps, input),
    akhiriHakPakai: (input) => akhiriHakPakai(deps, input),
    publicDenah: (lokasiId) => publicDenah(deps, lokasiId),
    tersediaUntukTerencana: (lokasiIds) => tersediaUntukTerencana(deps, lokasiIds),
    tahan: (input) => tahan(deps, input),
    lepasTahan: (nomorPemesanan) => lepasTahan(deps, nomorPemesanan),
    mulaiTahanBayar: (input) => mulaiTahanBayar(deps, input),
    beriHakPakaiDariTahan: (input) => beriHakPakaiDariTahan(deps, input),
    cariMakam: (input) => cariMakam(deps, input),
    makamPemegangHak: (input) => makamPemegangHak(deps, input),
    makamKeluargaSaya: (input) => makamKeluargaSaya(deps, input),
    tersediaPerJenisMakam: (lokasiId) => availability(deps.db, lokasiId),
    within: (tx) => createInventory({ ...deps, db: tx }),
  };
}
