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
import { buktiUntukHakPakai, orderOf, peringatanStafMasihPerlu, pesananSaya, type PemesananOrder } from "./reads";
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
  akhiriHakPakaiTidakTertagih,
  hakPakaiIdForTagihan,
  isBlockedByOverdueTagihan,
  tagihanPenghalangOf,
  type TagihanPenghalang,
  nyatakanTidakTertagih,
  nyatakanTidakTertagihSchema,
  type NyatakanTidakTertagihInput,
  type NyatakanTidakTertagihResult,
  type AkhiriHakPakaiTidakTertagihResult,
} from "./chasing";

import {
  konfirmasiTerencana,
  lewatBatasBayarTerencana,
  tarikTerencana,
  tolakTerencana,
  type KonfirmasiTerencanaResult,
  type LewatBatasBayarHasil,
  type TarikTerencanaResult,
  type TolakTerencanaResult,
} from "./terencana-konfirmasi";
import {
  antreanKonfirmasiTerencana,
  konfirmasiTerencanaLewatTenggat,
  terencanaUntukStaf,
  type OrderTerencanaAntrean,
  type OrderTerencanaStaf,
} from "./reads-terencana-staf";
import { nomorTerencanaAktifDiLokasi, pesananBerjalanDiLokasi, type PesananBerjalan } from "./pesanan-di-lokasi";
import {
  denahTerencana,
  kotaTerencana,
  periksaPilihanTerencana,
  placeTerencana,
  pilihanTerencana,
  terencanaOf,
  terencanaSaya,
  type DenahTerencana,
  type KartuTerencana,
  type PemesananTerencanaOrder,
  type PeriksaPilihanInput,
  type PeriksaPilihanResult,
  type PilihanTerencana,
  type PlaceTerencanaResult,
} from "./terencana";

import {
  ajukanPembatalanTerencana,
  ajukanUlangPembatalanTerencana,
  batalkanPermintaanPembatalanTerencana,
  pratinjauPembatalanTerencana,
  type AjukanPembatalanResult,
  type PratinjauPembatalanResult,
  type UbahPermintaanResult,
} from "./pembatalan-terencana";
import {
  mintaPerbaikanPembatalanTerencana,
  setujuiPembatalanTerencana,
  tolakPembatalanTerencana,
  type KeputusanPembatalanResult,
  type SetujuiPembatalanResult,
} from "./pembatalan-terencana-lokasi";
import {
  adaPembatalanTerbuka,
  antreanPembatalan,
  pembatalanUntukPesanan,
  pembatalanUntukStaf,
  persetujuanRefundPembatalan,
  type BarisAntreanPembatalan,
  type BarisPersetujuanRefundPembatalan,
  type PermintaanPembatalan,
  type PermintaanPembatalanStaf,
} from "./reads-pembatalan-terencana";
import {
  ajukanGantiPemegangHak,
  ajukanPengembalian,
  ajukanUlangPermintaanHakPakai,
  antreanPermintaanHakPakai,
  batalkanPermintaanHakPakai,
  mintaPerbaikanPermintaanHakPakai,
  permintaanHakPakaiTerakhir,
  setujuiPermintaanHakPakai,
  tolakPermintaanHakPakai,
  ubahCalonPenghuni,
  type AjukanPermintaanResult,
  type BarisAntreanPermintaanHakPakai,
  type PermintaanHakPakai,
  type SetujuiPermintaanHakPakaiResult,
  type UbahCalonPenghuniResult,
  type UbahPermintaanHakPakaiResult,
} from "./permintaan-hak-pakai";

export type {
  ChasingDijadwalkan,
  TidakTertagihDinyatakan,
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
export { PESANAN_SUBJECT_KINDS, timelineOrder } from "./reads";
export { JAM_REALERT_SAAT_DUKA, realertKonfirmasiSaatDukaTick, type RealertHasil } from "./realert";
export type { AkhiriHakPakaiTidakTertagihResult } from "./chasing";
export { nyatakanTidakTertagihSchema, type NyatakanTidakTertagihInput, type NyatakanTidakTertagihResult };
export { catatPemakamanTick, jatuhCatatPemakaman, type CatatPemakamanHasil } from "./prompt-catat-pemakaman";
export { DOKUMEN_MAX_BYTES, DOKUMEN_URL_SECONDS, centangDokumenSchema, unggahDokumenSchema } from "./berkas";
export type { CalonPenghuniTerencana, PemegangHak, PemesananKind, PemesananStatus, PemesananTerencanaStatus, SyaratTerencana } from "./schema";
export { pemesananTerencanaStatuses } from "./schema";
export type { PesananBerjalan } from "./pesanan-di-lokasi";
export { HARGA_BANDS } from "./terencana";
export {
  konfirmasiTerencanaSchema,
  tarikTerencanaSchema,
  tolakTerencanaSchema,
  type KonfirmasiTerencanaInput,
  type KonfirmasiTerencanaResult,
  type LewatBatasBayarHasil,
  type TarikTerencanaInput,
  type TarikTerencanaResult,
  type TolakTerencanaInput,
  type TolakTerencanaResult,
} from "./terencana-konfirmasi";
export { ALASAN_BATAL_TERENCANA, alasanBatalTerencana, type AlasanBatalTerencana } from "./alasan-batal-terencana";
export { TENGGAT_PEMBATALAN_HARI_KERJA, type AjukanPembatalanResult, type PembatalanHakPakai, type PratinjauPembatalanResult, type SebabPembatalanTerhalang, type UbahPermintaanResult } from "./pembatalan-terencana";
export { TENGGAT_PERSETUJUAN_REFUND_HARI_KERJA, type KeputusanPembatalanResult, type SetujuiPembatalanResult } from "./pembatalan-terencana-lokasi";
export type { HitungPembatalan } from "./pembatalan-terencana-hitung";
export type { BarisAntreanPembatalan, BarisPersetujuanRefundPembatalan, PermintaanPembatalan, PermintaanPembatalanStaf } from "./reads-pembatalan-terencana";
export type { PermintaanPembatalanStatus } from "./schema";
export { permintaanPembatalanStatuses } from "./schema";
export type { PermintaanGantiSebab, PermintaanHakPakaiJenis, PermintaanHakPakaiStatus } from "./schema";
export { permintaanGantiSebab, permintaanHakPakaiJenis, permintaanHakPakaiStatuses } from "./schema";
export {
  TENGGAT_PERMINTAAN_HAK_PAKAI_HARI_KERJA,
  type AjukanPermintaanResult,
  type BarisAntreanPermintaanHakPakai,
  type PermintaanHakPakai,
  type SebabPermintaanTerhalang,
  type SetujuiPermintaanHakPakaiResult,
  type UbahCalonPenghuniResult,
  type UbahPermintaanHakPakaiResult,
} from "./permintaan-hak-pakai";
export {
  ajukanGantiPemegangHakSchema,
  ajukanPengembalianSchema,
  ajukanUlangPermintaanHakPakaiSchema,
  mintaPerbaikanPermintaanHakPakaiSchema,
  permintaanHakPakaiIdSchema,
  setujuiPermintaanHakPakaiSchema,
  tolakPermintaanHakPakaiSchema,
  ubahCalonPenghuniSchema,
} from "./skema-permintaan-hak-pakai";
export type { CalonPenghuniBerubah } from "./deps";
export {
  ajukanPembatalanTerencanaSchema,
  ajukanUlangPembatalanTerencanaSchema,
  mintaPerbaikanPembatalanTerencanaSchema,
  permintaanPembatalanTerencanaSchema,
  tolakPembatalanTerencanaSchema,
} from "./skema-pembatalan";
export { alasanTolakTerencanaKeys, type AlasanTolakTerencana } from "./alasan-tolak";
export type { OrderTerencanaAntrean, OrderTerencanaStaf, UnitTerencanaBaca } from "./reads-terencana-staf";
export { pernahMenyebutPetakAtauKavling } from "./riwayat-petak";
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
  /** Every Pemesanan Makam of that Akun, newest first (Akun Saya's Pesanan tab, ticket 27). */
  pesananSaya(pemesan: { accountId: string }): Promise<PemesananOrder[]>;
  /**
   * The Bukti Pemesanan of a Hak Pakai's own order(s) (Akun Saya's Makam tab,
   * ticket 27). No actor: the caller must already know `hakPakaiId` is the
   * asking Akun's own (see the doc comment on `buktiUntukHakPakai` in
   * `./reads.ts` for the full contract, same as `inventory.hakPakaiById`).
   */
  buktiUntukHakPakai(hakPakaiId: string): Promise<{ id: string; nomor: string; link: string }[]>;
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
  /** The orders a Lokasi Mitra still has running (ticket 59): who is told at its Berhenti decision, and which paid Terencana orders its Pencairan release names. */
  pesananBerjalanDiLokasi(lokasiId: string): Promise<PesananBerjalan[]>;
  /** The Nomor Pemesanan of the paid, Aktif Pemesanan Terencana of a Lokasi Mitra: what its Berhenti releases the Pencairan of. */
  nomorTerencanaAktifDiLokasi(lokasiId: string): Promise<string[]>;
  /** Every Pemesanan Terencana of that Akun, newest first: Akun Saya's Pesanan tab lists them with the Saat Duka orders. */
  terencanaSaya(pemesan: { accountId: string }): Promise<PemesananTerencanaOrder[]>;
  /**
   * The Lokasi Mitra's answer to a Pemesanan Terencana (ticket 37). `konfirmasiTerencana` starts
   * the payment hold (Lokasi policy, 24 h by default) and issues the pay-first Tagihan due when it
   * ends; `tolakTerencana` declines with a reason off the closed list and releases the plots.
   * Only that Lokasi's Admin Lokasi; both audited in their own transaction.
   */
  konfirmasiTerencana(by: Actor, input: unknown): Promise<KonfirmasiTerencanaResult>;
  tolakTerencana(by: Actor, input: unknown): Promise<TolakTerencanaResult>;
  /** The Pemesan withdraws its own order, free, any time before paying: the plots are released and a confirmed order's Tagihan is cancelled. */
  tarikTerencana(pemesan: Pemesan, input: unknown): Promise<TarikTerencanaResult>;
  /**
   * The scheduler's tick: a confirmed Terencana order whose payment hold ended with its Tagihan
   * unpaid becomes Dibatalkan ("batas pembayaran lewat") and its plots are released. Idempotent.
   */
  lewatBatasBayarTick(now?: Date): Promise<LewatBatasBayarHasil>;
  /**
   * Whether a queued Peringatan Staf about one of this module's subjects still
   * needs sending: true while the order is still Diajukan, so a retry after its
   * Lokasi confirmed, declined or cancelled it is dropped (ticket 96). Answered
   * for Notifications, which never reads these tables.
   */
  peringatanStafMasihPerlu(subject: { kind: string; id: string }): Promise<boolean>;
  /** One Terencana order as the Lokasi Mitra's own staff read it; null for one that is not theirs. */
  terencanaUntukStaf(by: Actor, nomor: string): Promise<OrderTerencanaStaf | null>;
  /** The Antrean Lokasi's "Konfirmasi Terencana" rows: every Diajukan order of that Lokasi Mitra, oldest first. */
  antreanKonfirmasiTerencana(lokasiId: string): Promise<OrderTerencanaAntrean[]>;
  /** Admin Platform's Tier 3 "Konfirmasi Terencana terlambat" rows: Diajukan orders past the end of their Lokasi's next working day. */
  konfirmasiTerencanaLewatTenggat(): Promise<OrderTerencanaAntrean[]>;
  /**
   * The Pembatalan of a paid Terencana order (ticket 38). `pratinjauPembatalanTerencana` is Akun Saya's Makam tab:
   * for one Hak Pakai whose Pemegang Hak this Akun is, what "Ajukan Pembatalan" would refund under the order's own
   * Syarat snapshot, or why it cannot be asked (a Pemakaman, an earlier Ganti Pemegang Hak, a request already open).
   * One Hak Pakai at a time: the others on the order carry on.
   * `ajukanPembatalanTerencana` files it Diajukan with the refund fixed at that moment and the Antrean Lokasi row due
   * in 2 Hari Kerja; `ajukanUlangPembatalanTerencana` files a request sent back for a fix again (same refund), and
   * `batalkanPermintaanPembatalanTerencana` withdraws it before a decision.
   */
  pratinjauPembatalanTerencana(pemesan: Pemesan, hakPakaiId: string): Promise<PratinjauPembatalanResult>;
  ajukanPembatalanTerencana(pemesan: Pemesan, input: unknown): Promise<AjukanPembatalanResult>;
  ajukanUlangPembatalanTerencana(pemesan: Pemesan, input: unknown): Promise<UbahPermintaanResult>;
  batalkanPermintaanPembatalanTerencana(pemesan: Pemesan, input: unknown): Promise<UbahPermintaanResult>;
  /**
   * The Admin Lokasi's three answers (ticket 38), each audited on the Lokasi in its own transaction:
   * `setujuiPembatalanTerencana` confirms there is no Pemakaman and, in one commit, ends every Hak Pakai of the order,
   * frees its Petak, cancels the order, asks Refunds for the refund and tells the family;
   * `tolakPembatalanTerencana` declines with a reason; `mintaPerbaikanPembatalanTerencana` sends it back for a fix.
   */
  setujuiPembatalanTerencana(by: Actor, input: unknown): Promise<SetujuiPembatalanResult>;
  tolakPembatalanTerencana(by: Actor, input: unknown): Promise<KeputusanPembatalanResult>;
  mintaPerbaikanPembatalanTerencana(by: Actor, input: unknown): Promise<KeputusanPembatalanResult>;
  /** The Antrean Lokasi's "Pembatalan" rows: every request still Diajukan at that Lokasi Mitra, oldest first. */
  antreanPembatalan(lokasiId: string): Promise<BarisAntreanPembatalan[]>;
  /** Admin Platform's Tier 3 "Pembatalan refund approval" rows: approved Pembatalan whose refund waits for approval in Refunds. */
  persetujuanRefundPembatalan(): Promise<BarisPersetujuanRefundPembatalan[]>;
  /** Every Pembatalan request on one order, newest first, for the Lokasi Mitra's own staff (or Admin Platform). */
  pembatalanUntukStaf(by: Actor, nomor: string): Promise<PermintaanPembatalanStaf[]>;
  /** Every Pembatalan request on the order of this Pemesan, newest first: what the order page says, and where it asks for the bank account. */
  pembatalanUntukPesanan(pemesan: { accountId: string }, nomor: string): Promise<PermintaanPembatalan[]>;
  /** True while a Pembatalan request of this Hak Pakai is open: what blocks a Ganti Pemegang Hak. */
  adaPembatalanTerbuka(hakPakaiId: string): Promise<boolean>;
  /** "Kembalikan Hak Pakai": a Pengembalian request on an unused plot (ticket 39). */
  ajukanPengembalian(pemesan: Pemesan, input: unknown): Promise<AjukanPermintaanResult>;
  /** "Ajukan Ganti Pemegang Hak": the new holder, why, and any documents (ticket 39). */
  ajukanGantiPemegangHak(pemesan: Pemesan, input: unknown): Promise<AjukanPermintaanResult>;
  /** The Pemegang Hak files a Pengembalian / Ganti request the Lokasi sent back for a fix again (ticket 39). */
  ajukanUlangPermintaanHakPakai(pemesan: Pemesan, input: unknown): Promise<UbahPermintaanHakPakaiResult>;
  /** The Pemegang Hak withdraws its request before a decision (ticket 39). */
  batalkanPermintaanHakPakai(pemesan: Pemesan, input: unknown): Promise<UbahPermintaanHakPakaiResult>;
  /** The latest Pengembalian / Ganti request of a Hak Pakai (any state), for the Makam tab; null when none. */
  permintaanHakPakaiTerakhir(hakPakaiId: string): Promise<PermintaanHakPakai | null>;
  /** The Admin Lokasi approves: ends the Hak Pakai, or performs the Ganti and notes the offline fee (ticket 39). */
  setujuiPermintaanHakPakai(by: Actor, input: unknown): Promise<SetujuiPermintaanHakPakaiResult>;
  /** The Admin Lokasi declines, with the reason the family is told (ticket 39). */
  tolakPermintaanHakPakai(by: Actor, input: unknown): Promise<UbahPermintaanHakPakaiResult>;
  /** The Admin Lokasi sends the request back for a fix (ticket 39). */
  mintaPerbaikanPermintaanHakPakai(by: Actor, input: unknown): Promise<UbahPermintaanHakPakaiResult>;
  /** The Antrean Lokasi's Pengembalian / Ganti rows: every Diajukan request at that Lokasi Mitra, oldest first (ticket 39). */
  antreanPermintaanHakPakai(lokasiId: string): Promise<BarisAntreanPermintaanHakPakai[]>;
  /** The Pemegang Hak changes a plot's Calon Penghuni label freely; the Lokasi is notified (ticket 39). */
  ubahCalonPenghuni(pemesan: Pemesan, input: unknown): Promise<UbahCalonPenghuniResult>;
  /**
   * True while a Lokasi Mitra Saat Duka Tagihan on this Hak Pakai is Lewat
   * Jatuh Tempo (spec, Billing > Chasing; ticket 29): blocks Perpanjangan and
   * Ganti Pemegang Hak.
   */
  isBlockedByOverdueTagihan(hakPakaiId: string): Promise<boolean>;
  /** The Tagihan behind that block, with the number and pay link a family is shown (ticket 40), or null. */
  tagihanPenghalangOf(hakPakaiId: string): Promise<TagihanPenghalang | null>;
  /**
   * Admin Platform declares a chased Tagihan Tidak Tertagih (ticket 29): the
   * status change (guarded on H+30 and a logged call), its Entri Audit and the
   * queued Admin Lokasi push, in one transaction.
   */
  nyatakanTidakTertagih(by: Actor, input: NyatakanTidakTertagihInput): Promise<NyatakanTidakTertagihResult>;
  /**
   * The Admin Lokasi ends a Hak Pakai once its own Saat Duka Tagihan is Tidak
   * Tertagih (spec, Billing > Chasing; ticket 29).
   */
  akhiriHakPakaiTidakTertagih(by: Actor, input: { hakPakaiId: string; alasan?: string }): Promise<AkhiriHakPakaiTidakTertagihResult>;
  /** The Hak Pakai a Tagihan's own Saat Duka order granted, or null (ticket 29): what the overdue list offers "Akhiri Hak Pakai" against. */
  hakPakaiIdForTagihan(tagihanId: string): Promise<string | null>;
}

export function createPemesanan(deps: PemesananDeps): Pemesanan {
  return {
    pilihanSaatDuka: (query) => pilihanSaatDuka(deps, query),
    placeSaatDuka: (input) => placeSaatDuka(deps, input),
    orderOf: (nomor, pemesan) => orderOf(deps, pemesan, nomor),
    pesananSaya: (pemesan) => pesananSaya(deps, pemesan),
    buktiUntukHakPakai: (hakPakaiId) => buktiUntukHakPakai(deps, hakPakaiId),
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
    pesananBerjalanDiLokasi: (lokasiId) => pesananBerjalanDiLokasi(deps, lokasiId),
    nomorTerencanaAktifDiLokasi: (lokasiId) => nomorTerencanaAktifDiLokasi(deps, lokasiId),
    terencanaSaya: (pemesan) => terencanaSaya(deps, pemesan),
    konfirmasiTerencana: (by, input) => konfirmasiTerencana(deps, by, input),
    tolakTerencana: (by, input) => tolakTerencana(deps, by, input),
    tarikTerencana: (pemesan, input) => tarikTerencana(deps, pemesan, input),
    lewatBatasBayarTick: (now) => lewatBatasBayarTerencana(deps, now ?? deps.clock.now()),
    peringatanStafMasihPerlu: (subject) => peringatanStafMasihPerlu(deps, subject),
    terencanaUntukStaf: (by, nomor) => terencanaUntukStaf(deps, by, nomor),
    antreanKonfirmasiTerencana: (lokasiId) => antreanKonfirmasiTerencana(deps, lokasiId),
    konfirmasiTerencanaLewatTenggat: () => konfirmasiTerencanaLewatTenggat(deps, deps.clock.now()),
    pratinjauPembatalanTerencana: (pemesan, hakPakaiId) => pratinjauPembatalanTerencana(deps, pemesan, hakPakaiId),
    ajukanPembatalanTerencana: (pemesan, input) => ajukanPembatalanTerencana(deps, pemesan, input),
    ajukanUlangPembatalanTerencana: (pemesan, input) => ajukanUlangPembatalanTerencana(deps, pemesan, input),
    batalkanPermintaanPembatalanTerencana: (pemesan, input) => batalkanPermintaanPembatalanTerencana(deps, pemesan, input),
    setujuiPembatalanTerencana: (by, input) => setujuiPembatalanTerencana(deps, by, input),
    tolakPembatalanTerencana: (by, input) => tolakPembatalanTerencana(deps, by, input),
    mintaPerbaikanPembatalanTerencana: (by, input) => mintaPerbaikanPembatalanTerencana(deps, by, input),
    antreanPembatalan: (lokasiId) => antreanPembatalan(deps, lokasiId),
    persetujuanRefundPembatalan: () => persetujuanRefundPembatalan(deps),
    pembatalanUntukStaf: (by, nomor) => pembatalanUntukStaf(deps, by, nomor),
    pembatalanUntukPesanan: (pemesan, nomor) => pembatalanUntukPesanan(deps, pemesan, nomor),
    adaPembatalanTerbuka: (hakPakaiId) => adaPembatalanTerbuka(deps, hakPakaiId),
    ajukanPengembalian: (pemesan, input) => ajukanPengembalian(deps, pemesan, input),
    ajukanGantiPemegangHak: (pemesan, input) => ajukanGantiPemegangHak(deps, pemesan, input),
    ajukanUlangPermintaanHakPakai: (pemesan, input) => ajukanUlangPermintaanHakPakai(deps, pemesan, input),
    batalkanPermintaanHakPakai: (pemesan, input) => batalkanPermintaanHakPakai(deps, pemesan, input),
    permintaanHakPakaiTerakhir: (hakPakaiId) => permintaanHakPakaiTerakhir(deps, hakPakaiId),
    setujuiPermintaanHakPakai: (by, input) => setujuiPermintaanHakPakai(deps, by, input),
    tolakPermintaanHakPakai: (by, input) => tolakPermintaanHakPakai(deps, by, input),
    mintaPerbaikanPermintaanHakPakai: (by, input) => mintaPerbaikanPermintaanHakPakai(deps, by, input),
    antreanPermintaanHakPakai: (lokasiId) => antreanPermintaanHakPakai(deps, lokasiId),
    ubahCalonPenghuni: (pemesan, input) => ubahCalonPenghuni(deps, pemesan, input),
    isBlockedByOverdueTagihan: (hakPakaiId) => isBlockedByOverdueTagihan(deps, hakPakaiId),
    tagihanPenghalangOf: (hakPakaiId) => tagihanPenghalangOf(deps, hakPakaiId),
    nyatakanTidakTertagih: (by, input) => nyatakanTidakTertagih(deps, by, input),
    akhiriHakPakaiTidakTertagih: (by, input) => akhiriHakPakaiTidakTertagih(deps, by, input),
    hakPakaiIdForTagihan: (tagihanId) => hakPakaiIdForTagihan(deps, tagihanId),
  };
}

/** The worker's tick, as the scheduler registry calls it: the Saat Duka re-alert (ticket 23). */
export const pemesananRealertTick = realertKonfirmasiSaatDukaTick;

export type { TagihanPenghalang };
export { efekBuktiPemesanan, type BuktiPemesananEffectDeps } from "./efek-bukti-pemesanan";
