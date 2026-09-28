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
import { tolakSaatDuka, type TolakSaatDukaInput, type TolakSaatDukaResult } from "./tolak";
import {
  tawarkanAlternatif,
  terimaAlternatif,
  tolakAlternatif,
  type JawabAlternatifInput,
  type JawabAlternatifResult,
  type TawarkanAlternatifInput,
  type TawarkanAlternatifResult,
} from "./alternatif";
import { batalkanSaatDuka, batalkanUntukPemesan, type BatalkanSaatDukaInput, type BatalkanSaatDukaResult } from "./pembatalan";
import { rebookPesanan, type RebookPesanan } from "./rebook";
import { catatPemakaman, type CatatPemakamanOrderInput, type CatatPemakamanOrderResult } from "./catat-pemakaman";
import {
  antreanCatatPemakaman,
  antreanKonfirmasi,
  ditolak as ditolakOf,
  konfirmasiLewatTenggat,
  konfirmasiTerlambat,
  orderUntukStaf,
  orderUntukStafTerbaru,
  saatDukaDitolak,
  type OrderAntrean,
  type OrderDitolak,
  type OrderStaf,
} from "./reads-staf";
import {
  centangDokumen,
  unggahDokumen,
  urlDokumen,
  urlDokumenUntukStaf,
  type CentangDokumenInput,
  type DokumenResult,
  type UnggahDokumenInput,
} from "./berkas";
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
  PemesananBuktiPemesanan,
  PemesananDeps,
  Pemesan,
  PesananAlternatifDitawarkan,
  PemesananDiajukan,
  PesananDibatalkan,
  PemesananDikonfirmasi,
  PesananDitolak,
  PemesananNotifikasi,
  TerencanaDiajukan,
  TerencanaQuery,
} from "./deps";
export type { GrupSaatDuka, PilihanSaatDuka, PilihanSaatDukaQuery } from "./pilihan";
export { JAM_KONFIRMASI_SAAT_DUKA, kartuAwal } from "./pilihan";
export type { PemegangHakInput, PlaceSaatDukaInput, PlaceSaatDukaResult } from "./saat-duka";
export { konfirmasiSaatDukaSchema, type KonfirmasiSaatDukaInput, type KonfirmasiSaatDukaResult } from "./konfirmasi-saat-duka";
export { tolakSaatDukaSchema, type TolakSaatDukaInput, type TolakSaatDukaResult } from "./tolak";
export { batalkanSaatDukaSchema, type BatalkanSaatDukaInput, type BatalkanSaatDukaResult } from "./pembatalan";
export {
  jawabAlternatifSchema,
  tawarkanAlternatifSchema,
  type JawabAlternatifInput,
  type JawabAlternatifResult,
  type TawarkanAlternatifInput,
  type TawarkanAlternatifResult,
} from "./alternatif";
/**
 * The closed list of reasons a Saat Duka order can be declined with, split by
 * **who may choose it** — the Lokasi's own reasons (`alasanTolakLokasiKeys`, the
 * only ones its form may send) and the one the family produces by declining an
 * alternative — with the wording each is shown with (ticket 24). It lives in its
 * own file beside the module, which imports nothing from the database, so a
 * "use client" screen may take it from either here or that file.
 */
export {
  ALASAN_TOLAK,
  alasanTolakKeys,
  alasanTolakKeluargaKeys,
  alasanTolakLokasiKeys,
  alasanTolakLokasiSchema,
  type AlasanTolak,
  type AlasanTolakKeluarga,
  type AlasanTolakLokasi,
} from "./alasan-tolak";
export type { RebookPesanan } from "./rebook";
export type { DokumenOrder, OrderAntrean, OrderDitolak, OrderStaf } from "./reads-staf";
export { catatPemakamanOrderSchema, type CatatPemakamanOrderInput, type CatatPemakamanOrderResult } from "./catat-pemakaman";
export type { CentangDokumenInput, DokumenResult, UnggahDokumenInput } from "./berkas";
export type { LangkahOrder, PemesananOrder } from "./reads";
export { timelineOrder } from "./reads";
export { JAM_REALERT_SAAT_DUKA, realertKonfirmasiSaatDukaTick, type RealertHasil } from "./realert";
export { catatPemakamanTick, jatuhCatatPemakaman, type CatatPemakamanHasil } from "./prompt-catat-pemakaman";
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
   * The Admin Lokasi of that order's own Lokasi Mitra declines it, with a reason
   * off the closed fixed list: Ditolak, the family told with the rebook link, and
   * the Tier 1 call Admin Platform owes the family.
   */
  tolakSaatDuka(by: Actor, input: TolakSaatDukaInput): Promise<TolakSaatDukaResult>;
  /** How many of that Lokasi Mitra's orders were declined (story 118). */
  ditolak(lokasiId: string): Promise<number>;
  /** Every declined Saat Duka order: the Admin Platform Tier 1 "Saat Duka ditolak" rows (story 33). */
  saatDukaDitolak(): Promise<OrderDitolak[]>;
  /**
   * The Lokasi's Admin Lokasi offers an alternative on its own order: another
   * Jenis Makam, another burial day, or both, with the all-in total `quote()`
   * prices it at. The order stays Diajukan, waiting for the Pemesan.
   */
  tawarkanAlternatif(by: Actor, input: TawarkanAlternatifInput): Promise<TawarkanAlternatifResult>;
  /** The Pemesan accepts the alternative: the order moves on with the new Jenis Makam and day. */
  terimaAlternatif(pemesan: Pemesan, input: JawabAlternatifInput): Promise<JawabAlternatifResult>;
  /** The Pemesan refuses the alternative, which is a Tolak (story 31). */
  tolakAlternatif(pemesan: Pemesan, input: JawabAlternatifInput): Promise<JawabAlternatifResult>;
  /**
   * The Pemesan cancels its own order before the burial: nothing is billed and
   * nothing is held before the confirmation; after it, the order, the Hak Pakai,
   * the Petak and the Tagihan all move in one commit, and any payment is recorded
   * for refund less the Biaya Layanan Platform (story 34).
   */
  batalkanSaatDuka(pemesan: Pemesan, input: BatalkanSaatDukaInput): Promise<BatalkanSaatDukaResult>;
  /** The Admin Lokasi of that order's own Lokasi Mitra records the cancellation on the family's behalf, audited. */
  batalkanUntukPemesan(by: Actor, input: BatalkanSaatDukaInput): Promise<BatalkanSaatDukaResult>;
  /**
   * The rebook of one declined order: the banner, the Lokasi Mitra that is not to
   * be offered again, the city to look in and the family's own data for "Data &
   * kirim". Null for another family's order, or one that is not Ditolak.
   */
  rebook(nomor: string, pemesan: { accountId: string }): Promise<RebookPesanan | null>;
  /**
   * That Lokasi's own Admin Lokasi records the order's burial: the Pemakaman on
   * the Hak Pakai its confirmation created, the start of that Hak Pakai's tenure
   * clock at the recorded date, and the order Dimakamkan.
   */
  catatPemakaman(by: Actor, input: CatatPemakamanOrderInput): Promise<CatatPemakamanOrderResult>;
  /**
   * One order as that Lokasi Mitra's staff read it, with the family's own
   * details and its documents; null for an order that is not theirs (an Admin
   * Lokasi sees its own Lokasi's orders only).
   */
  orderUntukStaf(by: Actor, nomor: string): Promise<OrderStaf | null>;
  /** That Lokasi's own open orders, newest first: what an Admin Lokasi works down. */
  orderUntukStafTerbaru(by: Actor, lokasiId: string): Promise<OrderStaf[]>;
  /**
   * Every order of that Lokasi Mitra whose agreed burial day has passed with no
   * Pemakaman recorded yet, oldest first: the Antrean Lokasi's "Catat Pemakaman"
   * rows (ticket 25). A recorded burial removes its row for good.
   */
  antreanCatatPemakaman(lokasiId: string): Promise<OrderAntrean[]>;
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
}

export function createPemesanan(deps: PemesananDeps): Pemesanan {
  return {
    pilihanSaatDuka: (query) => pilihanSaatDuka(deps, query),
    placeSaatDuka: (input) => placeSaatDuka(deps, input),
    orderOf: (nomor, pemesan) => orderOf(deps, pemesan, nomor),
    konfirmasiSaatDuka: (by, input) => konfirmasiSaatDuka(deps, by, input),
    tolakSaatDuka: (by, input) => tolakSaatDuka(deps, by, input),
    ditolak: (lokasiId) => ditolakOf(deps, lokasiId),
    saatDukaDitolak: () => saatDukaDitolak(deps),
    tawarkanAlternatif: (by, input) => tawarkanAlternatif(deps, by, input),
    terimaAlternatif: (pemesan, input) => terimaAlternatif(deps, pemesan, input),
    tolakAlternatif: (pemesan, input) => tolakAlternatif(deps, pemesan, input),
    batalkanSaatDuka: (pemesan, input) => batalkanSaatDuka(deps, pemesan, input),
    batalkanUntukPemesan: (by, input) => batalkanUntukPemesan(deps, by, input),
    rebook: (nomor, pemesan) => rebookPesanan(deps, nomor, pemesan),
    catatPemakaman: (by, input) => catatPemakaman(deps, by, input),
    orderUntukStaf: (by, nomor) => orderUntukStaf(deps, by, nomor),
    orderUntukStafTerbaru: (by, lokasiId) => orderUntukStafTerbaru(deps, by, lokasiId),
    antreanCatatPemakaman: (lokasiId) => antreanCatatPemakaman(deps, lokasiId),
    antreanKonfirmasi: (lokasiId) => antreanKonfirmasi(deps, lokasiId),
    konfirmasiLewatTenggat: () => konfirmasiLewatTenggat(deps, deps.clock.now()),
    konfirmasiTerlambat: (lokasiId) => konfirmasiTerlambat(deps, lokasiId),
    unggahDokumen: (pemesan, input) => unggahDokumen(deps, pemesan, input),
    centangDokumen: (by, input) => centangDokumen(deps, by, input),
    urlDokumen: (pemesan, nomor, nama) => urlDokumen(deps, pemesan, nomor, nama),
    urlDokumenUntukStaf: (by, nomor, nama) => urlDokumenUntukStaf(deps, by, nomor, nama),
    pilihanTerencana: (query) => pilihanTerencana(deps, query),
    kotaTerencana: () => kotaTerencana(deps),
    denahTerencana: (lokasiId, pilihan) => denahTerencana(deps, lokasiId, pilihan),
    periksaPilihanTerencana: (input) => periksaPilihanTerencana(deps, input),
    placeTerencana: (input) => placeTerencana(deps, input),
    terencanaOf: (nomor, pemesan) => terencanaOf(deps, pemesan, nomor),
  };
}

/** The worker's tick, as the scheduler registry calls it: the Saat Duka re-alert (ticket 23). */
export const pemesananRealertTick = realertKonfirmasiSaatDukaTick;

export { efekBuktiPemesanan, type BuktiPemesananEffectDeps } from "./efek-bukti-pemesanan";
