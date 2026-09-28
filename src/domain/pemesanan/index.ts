/**
 * Pemesanan Makam at a Lokasi Mitra: Saat Duka, Terencana, a further burial
 * under an existing Hak Pakai (spec, domain module 6; CONTEXT.md).
 * Owns tables: pemesanan_makam and its documents (pemesanan_berkas), the
 * Terencana order (pemesanan_terencana) and its chosen units
 * (pemesanan_terencana_unit: several plots, a Calon Penghuni and a Syarat
 * snapshot, which the single-plot table cannot carry). Every order is one
 * Pemesanan Makam, told apart by its `kind`; a plot is assigned by the Lokasi at
 * the Saat Duka confirmation, and the Tagihan is issued then, so nothing is
 * billed at submission.
 *
 * Built so far: the Saat Duka wizard's "Pilih makam" list, its Kirim and the
 * order page that follows it (ticket 22); the Terencana wizard's three steps,
 * the hold it places and the order it reads back (ticket 36); the Lokasi's
 * confirmation of a Saat Duka order (a cleared Tersedia Petak → an Aktif Hak
 * Pakai → a pay-after Tagihan), the family documents on an order with the
 * Lokasi's checklist, and the re-alert of an order still unconfirmed (ticket
 * 23). The alternative, decline and cancellation are ticket 24.
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
import type { Actor } from "@/domain/identity";
import type { Pemesan, PemesananDeps, TerencanaQuery } from "./deps";
import { pilihanSaatDuka, type GrupSaatDuka, type PilihanSaatDukaQuery } from "./pilihan";
import { placeSaatDuka, type PlaceSaatDukaInput, type PlaceSaatDukaResult } from "./saat-duka";
import { orderOf, type PemesananOrder } from "./reads";
import { konfirmasiSaatDuka, type KonfirmasiSaatDukaInput, type KonfirmasiSaatDukaResult } from "./konfirmasi-saat-duka";
import {
  antreanKonfirmasi,
  konfirmasiLewatTenggat,
  konfirmasiTerlambat,
  orderUntukStaf,
  orderUntukStafTerbaru,
  type OrderAntrean,
  type OrderStaf,
} from "./reads-staf";
import { centangDokumen, unggahDokumen, urlDokumen, urlDokumenUntukStaf, type CentangDokumenInput, type DokumenResult, type UnggahDokumenInput } from "./berkas";
import { catatPembayaranLangsung, type CatatPembayaranLangsungResult } from "./bayar-langsung";
import { tambahHargaKhusus, type TambahHargaKhususResult } from "./harga-khusus";
import { pembayaranOrder, type PembayaranOrder } from "./pembayaran-order";
import { realertKonfirmasiSaatDukaTick } from "./realert";
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

export type {
  PemesananDeps,
  Pemesan,
  PemesananDiajukan,
  PemesananDikonfirmasi,
  PemesananNotifikasi,
  TerencanaDiajukan,
  TerencanaQuery,
} from "./deps";
export type { GrupSaatDuka, PilihanSaatDuka, PilihanSaatDukaQuery } from "./pilihan";
export { JAM_KONFIRMASI_SAAT_DUKA, kartuAwal } from "./pilihan";
export type { PemegangHakInput, PlaceSaatDukaInput, PlaceSaatDukaResult } from "./saat-duka";
export { konfirmasiSaatDukaSchema, type KonfirmasiSaatDukaInput, type KonfirmasiSaatDukaResult } from "./konfirmasi-saat-duka";
export type { DokumenOrder, OrderAntrean, OrderStaf } from "./reads-staf";
export type { BayarLangsungInput, CatatPembayaranLangsungResult } from "./bayar-langsung";
export type { HargaKhususInput, TambahHargaKhususResult } from "./harga-khusus";
export type { PembayaranOrder } from "./pembayaran-order";
export { BAYAR_LANGUNG_MAX_BYTES, bayarLangsungSchema } from "./bayar-langsung";
export { hargaKhususSchema } from "./harga-khusus";
export type { CentangDokumenInput, DokumenResult, UnggahDokumenInput } from "./berkas";
export type { LangkahOrder, PemesananOrder } from "./reads";
export { timelineOrder } from "./reads";
export { JAM_REALERT_SAAT_DUKA, realertKonfirmasiSaatDukaTick, type RealertHasil } from "./realert";
export { DOKUMEN_MAX_BYTES, DOKUMEN_URL_SECONDS, centangDokumenSchema, unggahDokumenSchema } from "./berkas";
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
  /**
   * That Lokasi's own Admin Lokasi confirms an order: the cleared Tersedia
   * Petak of the chosen Jenis Makam it assigns, the Aktif Hak Pakai that
   * creates, and the pay-after Tagihan issued with it, in one step.
   */
  konfirmasiSaatDuka(by: Actor, input: KonfirmasiSaatDukaInput): Promise<KonfirmasiSaatDukaResult>;
  /**
   * One order as that Lokasi Mitra's staff read it, with the family's own
   * details and its documents; null for an order that is not theirs (an Admin
   * Lokasi sees its own Lokasi's orders only).
   */
  orderUntukStaf(by: Actor, nomor: string): Promise<OrderStaf | null>;
  /** That Lokasi's own open orders, newest first: what an Admin Lokasi works down. */
  orderUntukStafTerbaru(by: Actor, lokasiId: string): Promise<OrderStaf[]>;
  /** Every order of one Lokasi Mitra still waiting for its confirmation, oldest first (the Antrean Lokasi's row). */
  antreanKonfirmasi(lokasiId: string): Promise<OrderAntrean[]>;
  /** Every order past the deadline its Lokasi's Jam Operasional gave (the Admin Platform Tier 1 row). */
  konfirmasiLewatTenggat(): Promise<OrderAntrean[]>;
  /** How many of a Lokasi Mitra's orders were confirmed after that deadline. */
  konfirmasiTerlambat(lokasiId: string): Promise<number>;
  /** The family adds (or replaces) a document on its own order's checklist, at any time. */
  unggahDokumen(pemesan: Pemesan, input: UnggahDokumenInput): Promise<DokumenResult>;
  /** The Lokasi's own Admin Lokasi ticks a checklist item off. */
  centangDokumen(by: Actor, input: CentangDokumenInput): Promise<DokumenResult>;
  /** A short-lived URL for one document of the caller's own order, or null. */
  urlDokumen(pemesan: Pemesan, nomor: string, nama: string): Promise<string | null>;
  /** The same for that Lokasi Mitra's own staff (or Admin Platform), and no other Lokasi's. */
  urlDokumenUntukStaf(by: Actor, nomor: string, nama: string): Promise<string | null>;
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
  /**
   * The Admin Lokasi of that Lokasi Mitra records that a family paid it directly,
   * with its own record of the cash: the order's Tagihan is settled as
   * "langsung ke Lokasi Mitra" (Lunas, one Bukti Pembayaran naming the Lokasi
   * Mitra, the same downstream effects), and the order keeps the fact that no
   * tariff Pencairan is due and a platform-fee Potongan is owed instead. Only
   * Admin Platform may reverse it, and that is ticket 31's refund.
   */
  catatPembayaranLangsung(by: Actor, input: unknown): Promise<CatatPembayaranLangsungResult>;
  /**
   * Admin Platform sets a Harga Khusus on one order, with a reason: its Tagihan
   * is cancelled and reissued with the reduction as its own negative line (never
   * edited), the partner share the Lokasi Mitra agreed to bear is written on the
   * order with its note (default 0), and both are audited. A resulting Rp 0
   * Tagihan is Lunas at once.
   */
  tambahHargaKhusus(by: Actor, input: unknown): Promise<TambahHargaKhususResult>;
  /**
   * Where the money of one order went, for the Payouts module to price its
   * Pencairan item from: the Lokasi Mitra, its Tagihan, the partner share and
   * whether the money reached the Operator at all. No actor, and no family
   * detail: it is the one projection, not the order page.
   */
  pembayaranOrder(nomor: string): Promise<PembayaranOrder | null>;
}

export function createPemesanan(deps: PemesananDeps): Pemesanan {
  // No default for `pencairanTerbit`: the Payouts module (ticket 32) owns that answer, and a
  // default that guessed "nothing has been paid out" would turn the partner-share freeze off
  // silently the day it is needed. Absent means unknown, and a share is refused (see
  // `tambahHargaKhusus`).
  const depsLengkap: PemesananDeps = deps;
  return {
    pilihanSaatDuka: (query) => pilihanSaatDuka(depsLengkap, query),
    placeSaatDuka: (input) => placeSaatDuka(depsLengkap, input),
    orderOf: (nomor, pemesan) => orderOf(depsLengkap, pemesan, nomor),
    konfirmasiSaatDuka: (by, input) => konfirmasiSaatDuka(depsLengkap, by, input),
    orderUntukStaf: (by, nomor) => orderUntukStaf(depsLengkap, by, nomor),
    orderUntukStafTerbaru: (by, lokasiId) => orderUntukStafTerbaru(depsLengkap, by, lokasiId),
    antreanKonfirmasi: (lokasiId) => antreanKonfirmasi(depsLengkap, lokasiId),
    konfirmasiLewatTenggat: () => konfirmasiLewatTenggat(depsLengkap, deps.clock.now()),
    konfirmasiTerlambat: (lokasiId) => konfirmasiTerlambat(depsLengkap, lokasiId),
    unggahDokumen: (pemesan, input) => unggahDokumen(depsLengkap, pemesan, input),
    centangDokumen: (by, input) => centangDokumen(depsLengkap, by, input),
    urlDokumen: (pemesan, nomor, nama) => urlDokumen(depsLengkap, pemesan, nomor, nama),
    urlDokumenUntukStaf: (by, nomor, nama) => urlDokumenUntukStaf(depsLengkap, by, nomor, nama),
    pilihanTerencana: (query) => pilihanTerencana(depsLengkap, query),
    kotaTerencana: () => kotaTerencana(deps),
    denahTerencana: (lokasiId, pilihan) => denahTerencana(depsLengkap, lokasiId, pilihan),
    periksaPilihanTerencana: (input) => periksaPilihanTerencana(depsLengkap, input),
    placeTerencana: (input) => placeTerencana(depsLengkap, input),
    terencanaOf: (nomor, pemesan) => terencanaOf(depsLengkap, pemesan, nomor),
    catatPembayaranLangsung: (by, input) => catatPembayaranLangsung(depsLengkap, by, input),
    tambahHargaKhusus: (by, input) => tambahHargaKhusus(depsLengkap, by, input),
    pembayaranOrder: (nomor) => pembayaranOrder(depsLengkap, nomor),
  };
}

/** The worker's tick, as the scheduler registry calls it: the Saat Duka re-alert (ticket 23). */
export const pemesananRealertTick = realertKonfirmasiSaatDukaTick;
