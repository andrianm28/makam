/**
 * Pemesanan (spec, domain module 6): booking a Petak Makam at a Lokasi Mitra.
 *
 * This slice is the Pemesanan Terencana wizard (ticket 36): a booking made in
 * advance, reserving exact plots a Pemesan picks on the Denah. The Saat Duka
 * wizard (ticket 22) and the burial under an existing Hak Pakai (ticket 35) are
 * their own kinds of the same journey; what this module owns today is the order
 * of a Terencana booking, the plots it holds and the Syarat it snapshots.
 *
 * Owns tables: pemesanan_terencana, pemesanan_terencana_unit.
 *
 * Every public function here is the wizard's own step, and each one reaches its
 * neighbours only through their public functions: the Lokasi Mitra's listing,
 * tumpang rules and Kontak Siaga from Lokasi, every price from Tariffs' `quote()`,
 * the pickable plots and the hold from Inventory, the Nomor Pemesanan from
 * Billing, the Akun behind an email from Identity, and the message the Lokasi
 * Mitra's staff get from Notifications. No actor: these steps are a family's own
 * wizard, so the Server Actions are what authenticate and check the role.
 */
import type { Database } from "@/db/client";
import type { PemesananDeps, TerencanaQuery } from "./deps";
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

export type { PemesananDeps, PemesananNotifikasi, Pemesan, TerencanaQuery } from "./deps";
export type { CalonPenghuniTerencana, PemegangHakTerencana, PemesananTerencanaStatus, SyaratTerencana } from "./schema";
export { pemesananTerencanaStatuses } from "./schema";
export { HARGA_BANDS } from "./terencana";
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

/** The Pemesanan Terencana wizard: its three steps and the order it places. */
export interface Pemesanan {
  /** Step 1, "Lokasi": every Lokasi Mitra that take a Terencana order, by city, all-in price band and facilities. */
  pilihanTerencana(query?: TerencanaQuery): Promise<KartuTerencana[]>;
  /** Every city with at least one of them, for that step's city filter. */
  kotaTerencana(): Promise<string[]>;
  /**
   * Step 2, "Petak": the Denah of one of them, with the chosen plots (if any) priced
   * at this instant by `quote()`, the "Nanti" line and the Syarat to be shown before Kirim.
   */
  denahTerencana(lokasiId: string, pilihan?: PilihanTerencana): Promise<DenahTerencana | null>;
  /**
   * Whether a chosen selection can still be ordered, read now: the several-Petak or
   * one-Kavling rule, then every unit against the Denah. A refusal names the plot and
   * hands back the picks that are still good, so a plot taken meanwhile costs the
   * family one pick and not the whole wizard. Both "Lanjut" and Kirim go through it.
   */
  periksaPilihanTerencana(input: PeriksaPilihanInput): Promise<PeriksaPilihanResult>;
  /** Step 3, "Kirim": places the order — it holds every chosen plot, takes a Nomor Pemesanan and snapshots the Syarat. */
  placeTerencana(input: unknown): Promise<PlaceTerencanaResult>;
  /** The placed order as its own Pemesan reads it, with the Syarat it was placed under (its own snapshot, never the Lokasi's current policy). */
  terencanaOf(db: Database, pemesan: { accountId: string }, nomor: string): Promise<PemesananTerencanaOrder | null>;
}

export function createPemesanan(deps: PemesananDeps): Pemesanan {
  return {
    pilihanTerencana: (query) => pilihanTerencana(deps, query),
    kotaTerencana: () => kotaTerencana(deps),
    denahTerencana: (lokasiId, pilihan) => denahTerencana(deps, lokasiId, pilihan),
    periksaPilihanTerencana: (input) => periksaPilihanTerencana(deps, input),
    placeTerencana: (input) => placeTerencana(deps, input),
    terencanaOf: (db, pemesan, nomor) => terencanaOf({ db }, pemesan, nomor),
  };
}
