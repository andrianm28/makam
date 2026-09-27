/**
 * Layanan and Paket Layanan (spec, domain module 9): the one global Layanan
 * catalog kept by Admin Platform, which Layanan each Lokasi Mitra offers and
 * which are offered at a DKI TPU, the prices that go with them, and the Paket
 * Layanan definitions.
 *
 * Owns tables: layanan_layanan, layanan_varian, layanan_penawaran, layanan_paket,
 * layanan_paket_item.
 *
 * Every price of a Layanan variant is a versioned tariff in the Tariffs module
 * (its price at a Lokasi Mitra, the DKI price, the Mitra Jasa rate), never a
 * column here: a variant with no price in force cannot be offered, so there is
 * no free pricing, and a Paket Layanan's price is the sum of its items' prices
 * at that place, from `quote()`.
 *
 * Every write is a staff write, and only Admin Platform may make one (spec,
 * Identity & Access: the Operator's central staff keep the Layanan catalog and
 * the Paket Layanan). Each records an Entri Audit through the Audit Log module in
 * the same transaction, on the Lokasi Mitra when the write is about one, and
 * re-checks `authorize` itself.
 *
 * Left to later tickets: ordering a Layanan or a Paket (50, 53, 54), a Paket's
 * recurring cycles (54) and the Mitra Jasa who fulfils a job at a TPU (55, 56).
 * This module is the catalog, the offers and the prices.
 */
import type { Actor } from "@/domain/identity";
import type { SetHargaLayananInput } from "@/domain/tariffs";
import type { LayananDeps } from "./deps";
import {
  createLayanan as createLayananEntry,
  hapusLayanan,
  katalog,
  ubahLayanan as ubahLayananEntry,
  type CreateLayananResult,
  type HapusLayananResult,
  type LayananTerbaca,
  type NewLayanan,
  type PerubahanLayanan,
  type UbahLayananResult,
} from "./katalog";
import { hapusVarian, tambahVarian, type HapusVarianResult, type NewVarian, type TambahVarianResult } from "./varian";
import {
  stopLayanan,
  tandaiBolehDiTpu,
  tawarkanLayanan,
  type StopLayananResult,
  type TandaiBolehDiTpuResult,
  type TawarkanLayananResult,
} from "./penawaran";
import {
  buatPaket,
  hapusPaket,
  semuaPaket,
  ubahPaket,
  type BuatPaketResult,
  type HapusPaketResult,
  type NewPaket,
  type PaketLayanan,
  type PerubahanPaket,
  type UbahPaketResult,
} from "./paket";
import {
  hargaPaket as hargaPaketOf,
  layananDiLokasi,
  penawaranLokasi,
  penawaranTpu,
  type HargaLayanan,
  type LayananDiLokasi,
  type LayananDiTempat,
  type Tempat,
} from "./harga";

export type { LayananDeps } from "./deps";
export { buktiPerJenis, buktiValues, frekuensiValues, jenisLayananValues } from "./schema";
export type { Bukti, Frekuensi, JenisLayanan } from "./schema";
export { buktiOf, proofOf } from "./katalog";
export type {
  CreateLayananResult,
  HapusLayananResult,
  LayananKatalog,
  LayananTerbaca,
  NewLayanan,
  PerubahanLayanan,
  ProofRequirement,
  UbahLayananResult,
} from "./katalog";
export type { HapusVarianResult, NewVarian, TambahVarianResult, VarianDenganLayanan, VarianLayanan } from "./varian";
export type { StopLayananResult, TandaiBolehDiTpuResult, TawarkanLayananResult } from "./penawaran";
export type { BuatPaketResult, HapusPaketResult, NewPaket, PaketLayanan, PerubahanPaket, UbahPaketResult } from "./paket";
export type { HargaLayanan, LayananDiLokasi, LayananDiTempat, Tempat, VarianDitawarkan } from "./harga";

export interface Layanan {
  /** Admin Platform adds a Layanan to the catalog with its first variants; audited. */
  createLayanan(by: Actor, input: NewLayanan): Promise<CreateLayananResult>;
  /** Admin Platform changes a Layanan's own fields (never its variants: those are added or removed one at a time); audited. */
  ubahLayanan(by: Actor, layananId: string, input: PerubahanLayanan): Promise<UbahLayananResult>;
  /** Admin Platform adds a fixed-price variant to a Layanan; audited. */
  tambahVarian(by: Actor, layananId: string, input: NewVarian): Promise<TambahVarianResult>;
  /** Admin Platform removes a variant, refused while a Lokasi Mitra has ever offered it or a Paket contains it; audited. */
  hapusVarian(by: Actor, layananVariantId: string, input: { reason: string | null }): Promise<HapusVarianResult>;
  /**
   * Admin Platform marks a Layanan variant "boleh di TPU DKI" by hand, or takes
   * the mark off: only a marked variant is offered at a TPU, and no Pemda rule is
   * encoded. Audited.
   */
  tandaiBolehDiTpu(by: Actor, layananVariantId: string, input: { boleh: boolean; reason: string | null }): Promise<TandaiBolehDiTpuResult>;
  /**
   * Admin Platform switches one Layanan variant on at a Lokasi Mitra with that
   * place's price for it: one decision, one transaction, two Entri Audits on that
   * Lokasi. A price the Tariffs module refuses leaves no offering behind.
   */
  tawarkanLayanan(by: Actor, lokasiId: string, layananVariantId: string, input: SetHargaLayananInput): Promise<TawarkanLayananResult>;
  /** Admin Platform stops a Lokasi Mitra offering a Layanan variant; audited on that Lokasi. */
  stopLayanan(by: Actor, lokasiId: string, layananVariantId: string, input: { reason: string | null }): Promise<StopLayananResult>;
  /** Admin Platform defines a Paket Layanan: its items and its frequency; audited. */
  buatPaket(by: Actor, input: NewPaket): Promise<BuatPaketResult>;
  /** Admin Platform changes a Paket Layanan's items, frequency or wording; audited. */
  ubahPaket(by: Actor, paketId: string, input: PerubahanPaket): Promise<UbahPaketResult>;
  /** Admin Platform removes a Paket Layanan definition; audited. */
  hapusPaket(by: Actor, paketId: string, input: { reason: string | null }): Promise<HapusPaketResult>;
  /**
   * Admin Platform removes a Layanan from the catalog with its variants; refused
   * while a Lokasi Mitra was ever offered one of them or a Paket Layanan contains
   * one; audited.
   */
  hapusLayanan(by: Actor, layananId: string, input: { reason: string | null }): Promise<HapusLayananResult>;
  /** Every Layanan of the one global catalog, by name, with its variants and the proof each requires. */
  katalog(): Promise<LayananTerbaca[]>;
  /** Every Paket Layanan, by name, with its items. */
  paket(): Promise<PaketLayanan[]>;
  /**
   * The Layanan a Lokasi Mitra offers at `at`, each variant with that place's
   * all-in price (the public Lokasi page). Empty for a Lokasi Mitra that is not listed.
   */
  penawaranLokasi(lokasiId: string, at: Date): Promise<LayananDiTempat[]>;
  /** The Layanan offered at every DKI TPU at `at`, each variant with its price. */
  penawaranTpu(at: Date): Promise<LayananDiTempat[]>;
  /**
   * Which Layanan one Lokasi Mitra offers and what it charges at `at`, for a
   * staff reader: an Admin Platform or that Lokasi's own Admin Lokasi, and a
   * Lokasi Mitra that is not listed yet.
   */
  asStaff(by: Actor): StaffLayananReads;
  /**
   * A Paket Layanan's price at a place: the sum of its items' prices there, from
   * `quote()`. Null where it is not offered, which is every place where one of
   * its items is not.
   */
  hargaPaket(paketId: string, di: Tempat, at: Date): Promise<HargaLayanan | null>;
}

export function createLayanan(deps: LayananDeps): Layanan {
  return {
    createLayanan: (by, input) => createLayananEntry(deps, by, input),
    ubahLayanan: (by, layananId, input) => ubahLayananEntry(deps, by, layananId, input),
    tambahVarian: (by, layananId, input) => tambahVarian(deps, by, layananId, input),
    hapusVarian: (by, layananVariantId, input) => hapusVarian(deps, by, layananVariantId, input),
    tandaiBolehDiTpu: (by, layananVariantId, input) => tandaiBolehDiTpu(deps, by, layananVariantId, input),
    tawarkanLayanan: (by, lokasiId, layananVariantId, input) => tawarkanLayanan(deps, by, lokasiId, layananVariantId, input),
    stopLayanan: (by, lokasiId, layananVariantId, input) => stopLayanan(deps, by, lokasiId, layananVariantId, input),
    buatPaket: (by, input) => buatPaket(deps, by, input),
    ubahPaket: (by, paketId, input) => ubahPaket(deps, by, paketId, input),
    hapusPaket: (by, paketId, input) => hapusPaket(deps, by, paketId, input),
    hapusLayanan: (by, layananId, input) => hapusLayanan(deps, by, layananId, input),
    katalog: () => katalog(deps.db),
    paket: () => semuaPaket(deps.db),
    penawaranLokasi: (lokasiId, at) => penawaranLokasi(deps, lokasiId, at),
    penawaranTpu: (at) => penawaranTpu(deps, at),
    hargaPaket: (paketId, di, at) => hargaPaketOf(deps, paketId, di, at),
    asStaff: (by) => staffLayananReads(deps, by),
  };
}

/** The staff reads: which Layanan a Lokasi Mitra offers, for a Lokasi they may see. */
export interface StaffLayananReads {
  /** Which Layanan one Lokasi Mitra offers and what it charges at `at` (empty for a Lokasi this reader may not see). */
  lokasiLayanan(lokasiId: string, at: Date): Promise<LayananDiLokasi[]>;
}

function staffLayananReads(deps: LayananDeps, by: Actor): StaffLayananReads {
  return {
    lokasiLayanan: async (lokasiId, at) => ((await deps.lokasi.lokasiMitra(by, lokasiId)).ok ? layananDiLokasi(deps, lokasiId, at) : []),
  };
}
