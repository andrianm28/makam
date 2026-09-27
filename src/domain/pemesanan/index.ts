/**
 * Pemesanan Makam at a Lokasi Mitra: Saat Duka, Terencana, a further burial
 * under an existing Hak Pakai (spec, domain module 6; CONTEXT.md).
 *
 * Owns tables: pemesanan_makam (the Saat Duka order), pemesanan_terencana and
 * pemesanan_terencana_unit (the Terencana order: several chosen plots, a Calon
 * Penghuni and a Syarat snapshot, which the single-plot table cannot carry). Both
 * are one Pemesanan Makam each, told apart by the `kind` of `pemesananKinds`
 * (`pemesanan_makam.kind` and the Terencana table's own name); the Lokasi's
 * confirmation, alternative plot, Tolak and Pembatalan are the next tickets.
 *
 * Built so far: the Saat Duka wizard's "Pilih makam" list, its Kirim and the
 * order page that follows it (ticket 22); the Terencana wizard's three steps,
 * the hold it places and the order it reads back (ticket 36).
 *
 * Every public function here is one wizard step or one order read, and each one
 * reaches its neighbours only through their public functions: the Lokasi Mitra's
 * listing, tumpang rules and Kontak Siaga from Lokasi, every price from Tariffs'
 * `quote()`, the pickable plots and the hold from Inventory, the Nomor Pemesanan
 * from Billing, the Akun behind an email from Identity, and the messages the
 * Lokasi Mitra's staff get from Notifications. No actor: these steps are a
 * family's own wizard, so the Server Actions are what authenticate and check the
 * role.
 */
import type { PemesananDeps, TerencanaQuery } from "./deps";
import { pilihanSaatDuka, type GrupSaatDuka, type PilihanSaatDukaQuery } from "./pilihan";
import { placeSaatDuka, type PlaceSaatDukaInput, type PlaceSaatDukaResult } from "./saat-duka";
import { orderOf, type PemesananOrder } from "./reads";
import {
  denahTerencana,
  kotaTerencana,
  periksaPilihanTerencana,
  placeTerencana,
  pilihanTerencana,
  terencanaOf,
  type DenahTerencana,
  type KartuTerencana,
  type PemesananTerencanaOrder,
  type PeriksaPilihanInput,
  type PeriksaPilihanResult,
  type PilihanTerencana,
  type PlaceTerencanaResult,
} from "./terencana";

export type { PemesananDeps, Pemesan, PemesananDiajukan, PemesananNotifikasi, TerencanaDiajukan, TerencanaQuery } from "./deps";
export type { GrupSaatDuka, PilihanSaatDuka, PilihanSaatDukaQuery } from "./pilihan";
export { JAM_KONFIRMASI_SAAT_DUKA, kartuAwal } from "./pilihan";
export type { PemegangHakInput, PlaceSaatDukaInput, PlaceSaatDukaResult } from "./saat-duka";
export type { LangkahOrder, PemesananOrder } from "./reads";
export { timelineOrder } from "./reads";
export type { CalonPenghuniTerencana, PemegangHak, PemesananKind, PemesananStatus, PemesananTerencanaStatus, SyaratTerencana } from "./schema";
export { pemesananTerencanaStatuses } from "./schema";
export { HARGA_BANDS } from "./terencana";
/**
 * The Terencana wizard's boundaries. A Client Component (the wizard's form) takes
 * these from this file rather than from this module's barrel, because a bundler keeps
 * a module whole and the barrel reaches the database: a value taken from it would put
 * `pg` in the browser. They are the same objects either way.
 */
export {
  TERENCANA_MAKS_UNIT,
  periksaPilihanTerencanaSchema,
  placeTerencanaSchema,
  terencanaCalonPenghuniSchema,
  terencanaPemegangHakSchema,
  terencanaUnitSchema,
} from "./skema-terencana";
export type { PeriksaPilihanTerencanaInput, PlaceTerencanaInput } from "./skema-terencana";
export type {
  BarisTotal,
  DenahTerencana,
  KartuTerencana,
  PemesananTerencanaOrder,
  PeriksaPilihanInput,
  PeriksaPilihanResult,
  PilihanDitolak,
  PilihanTerencana,
  PlaceTerencanaResult,
  TotalTerencana,
  UnitTerencana,
} from "./terencana";

export interface Pemesanan {
  /**
   * The Saat Duka "Pilih makam" list: every Terverifikasi Lokasi Mitra that
   * still has a Jenis Makam with cleared Tersedia units, each priced all-in
   * and within the QRIS cap, cheapest first, filtered by kota, and narrowed to
   * the one card "Data & kirim" prices again. No actor.
   */
  pilihanSaatDuka(query?: PilihanSaatDukaQuery): Promise<GrupSaatDuka[]>;
  /**
   * Places a Pemesanan Saat Duka for a proven email: Diajukan, with its Nomor
   * Pemesanan and the confirmation deadline, and no Tagihan.
   */
  placeSaatDuka(input: PlaceSaatDukaInput): Promise<PlaceSaatDukaResult>;
  /** One Pemesanan Makam of that Akun, by its Nomor Pemesanan, or null. */
  orderOf(nomor: string, pemesan: { accountId: string }): Promise<PemesananOrder | null>;
  /** The Terencana wizard's step 1, "Lokasi": every Lokasi Mitra that takes a Terencana order, by city, all-in price band and facilities. */
  pilihanTerencana(query?: TerencanaQuery): Promise<KartuTerencana[]>;
  /** Every city with at least one of them, for that step's city filter. */
  kotaTerencana(): Promise<string[]>;
  /**
   * The Terencana wizard's step 2, "Petak": the Denah of one of them, with the chosen
   * plots (if any) priced at this instant by `quote()`, the "Nanti" line and the Syarat
   * to be shown before Kirim.
   */
  denahTerencana(lokasiId: string, pilihan?: PilihanTerencana): Promise<DenahTerencana | null>;
  /**
   * Whether a chosen selection can still be ordered, read now: the several-Petak or
   * one-Kavling rule, then every unit against the Denah. A refusal names the plot and
   * hands back the picks that are still good, so a plot taken meanwhile costs the
   * family one pick and not the whole wizard. Both "Lanjut" and Kirim go through it.
   */
  periksaPilihanTerencana(input: PeriksaPilihanInput): Promise<PeriksaPilihanResult>;
  /** The Terencana wizard's step 3, "Kirim": places the order — it holds every chosen plot, takes a Nomor Pemesanan and snapshots the Syarat. */
  placeTerencana(input: unknown): Promise<PlaceTerencanaResult>;
  /** The placed Terencana order as its own Pemesan reads it, with the Syarat it was placed under (its own snapshot, never the Lokasi's current policy). */
  terencanaOf(nomor: string, pemesan: { accountId: string }): Promise<PemesananTerencanaOrder | null>;
}

export function createPemesanan(deps: PemesananDeps): Pemesanan {
  return {
    pilihanSaatDuka: (query) => pilihanSaatDuka(deps, query),
    placeSaatDuka: (input) => placeSaatDuka(deps, input),
    orderOf: (nomor, pemesan) => orderOf(deps, pemesan, nomor),
    pilihanTerencana: (query) => pilihanTerencana(deps, query),
    kotaTerencana: () => kotaTerencana(deps),
    denahTerencana: (lokasiId, pilihan) => denahTerencana(deps, lokasiId, pilihan),
    periksaPilihanTerencana: (input) => periksaPilihanTerencana(deps, input),
    placeTerencana: (input) => placeTerencana(deps, input),
    terencanaOf: (nomor, pemesan) => terencanaOf(deps, pemesan, nomor),
  };
}
