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
import type { MitraJasaStatus } from "./schema";
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
import {
  bacaMitraJasa,
  buatMitraJasa,
  hapusTidakTersedia,
  mitraJasaBelumLengkap,
  mitraJasaCountByStatus,
  rentangTidakTersedia,
  semuaMitraJasa,
  tambahTidakTersedia,
  ubahCoverage,
  ubahProfil,
  ubahRekening,
  ubahStatus,
  unggahBerkas,
  type BacaMitraJasaResult,
  type BerkasResult,
  type BuatMitraJasaResult,
  type CoverageResult,
  type MitraJasa,
  type MitraJasaBelumLengkap,
  type TidakTersediaResult,
  type UbahProfilResult,
  type UbahStatusResult,
  type RekeningResult,
  type RentangTidakTersedia,
} from "./mitra-jasa";
import { mitraJasaTersedia, type MitraJasaTersedia } from "./penugasan";
import type { KebutuhanPenugasan } from "./mitra-jasa-skema";
import {
  catatTinjauan,
  skorMitraJasa,
  skorSaya,
  tinjauSkorTick,
  tinjauanMitraJasa,
  tinjauanTerbuka,
  type CatatTinjauanResult,
  type ScorecardResult,
  type TinjauanMitraJasa,
} from "./skor";

export type { LayananDeps, PekerjaanMitraJasa, PekerjaanMitraJasaPort } from "./deps";
export { buktiPerJenis, buktiValues, frekuensiValues, jenisLayananValues, mitraJasaStatuses } from "./schema";
export type { Bukti, Frekuensi, JenisLayanan, MitraJasaStatus } from "./schema";
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
export {
  BARU_SAMPAI_SELESAI,
  LANGKAH_ONBOARDING,
  langkahBelumLengkap as langkahOnboardingBelumLengkap,
} from "./mitra-jasa";
/** The input schemas a form may take from this module's own schema file, never from here (a client component must not reach the database). */
export {
  berkasMitraJasaSchema,
  coverageMitraJasaSchema,
  kebutuhanPenugasanSchema,
  profilMitraJasaSchema,
  rekeningMitraJasaSchema,
  statusMitraJasaSchema,
  tidakTersediaSchema,
} from "./mitra-jasa-skema";
export type { MitraJasa, MitraJasaBelumLengkap, ReleasedJob, LangkahOnboarding } from "./mitra-jasa";
export type {
  BerkasMitraJasaInput,
  CoverageMitraJasaInput,
  KebutuhanPenugasan,
  ProfilMitraJasaInput,
  RekeningMitraJasaInput,
  StatusMitraJasaInput,
  TidakTersediaInput,
} from "./mitra-jasa-skema";
export { SKOR_WINDOW_HARI } from "./skor";
export type { SkorMitraJasa, TinjauanMitraJasa } from "./skor";
export type { MitraJasaTersedia } from "./penugasan";

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

  /* The Mitra Jasa: onboarding, availability, status and the 90-day scorecard
   * (spec, Layanan > Mitra Jasa; ticket 55). Every write here is audited, and the
   * two that decide money or work (the bank account, the status) refuse on their
   * own rule rather than on the caller's. */

  /** Admin Platform starts a Mitra Jasa's onboarding record, addressed to the email the Undangan Staf goes to. */
  buatMitraJasa(by: Actor, email: string, input: unknown): Promise<BuatMitraJasaResult>;
  /** Admin Platform records or changes the profile: name, NIK, home area, optional emergency contact. No NPWP field exists. */
  ubahProfil(by: Actor, mitraJasaId: string, input: unknown): Promise<UbahProfilResult>;
  /** Admin Platform sets the bank account: the name must be the KTP's, or carry an override note. */
  ubahRekening(by: Actor, mitraJasaId: string, input: unknown): Promise<RekeningResult>;
  /** Admin Platform uploads the KTP photo, the Mitra Jasa's photo or the signed arrangement scan. */
  unggahBerkas(by: Actor, mitraJasaId: string, input: unknown): Promise<BerkasResult>;
  /** Admin Platform sets the coverage lists: which DKI TPUs and which Layanan variants. */
  ubahCoverage(by: Actor, mitraJasaId: string, input: unknown): Promise<CoverageResult>;
  /**
   * Admin Platform sets Aktif / Ditangguhan / Berhenti with a reason. A suspension
   * or an ending releases every `dijadwalkan` job in the same transaction and
   * returns the in-progress ones for Admin Platform to reassign.
   */
  ubahStatus(by: Actor, mitraJasaId: string, input: unknown): Promise<UbahStatusResult>;
  /** Every Mitra Jasa, by name, with the "Baru" badge and their finished count; empty for anyone else. */
  semuaMitraJasa(by: Actor): Promise<MitraJasa[]>;
  /** One Mitra Jasa, with its bank account, NIK, coverage and status; Admin Platform only. */
  bacaMitraJasa(by: Actor, mitraJasaId: string): Promise<BacaMitraJasaResult>;
  /** How many Mitra Jasa are in each status (the list's filter strip). */
  mitraJasaCountByStatus(by: Actor): Promise<Record<MitraJasaStatus, number>>;
  /** Every Mitra Jasa whose onboarding is not complete, and which of the nine steps are missing (the Tier 4 row's query). */
  mitraJasaBelumLengkap(by: Actor): Promise<MitraJasaBelumLengkap[]>;
  /**
   * Which Mitra Jasa may take one TPU job: `aktif`, covering that TPU and that
   * Layanan variant, and not away on that date. The filter ticket 56's picker
   * reads, so the picker's rules live in one place.
   */
  mitraJasaTersedia(by: Actor, input: KebutuhanPenugasan | unknown): Promise<MitraJasaTersedia[]>;
  /** A Mitra Jasa sets one of their own "Tidak tersedia" ranges; the picker leaves them out for those dates. */
  tambahTidakTersedia(by: Actor, input: unknown): Promise<TidakTersediaResult>;
  /** A Mitra Jasa takes one of their own ranges off. */
  hapusTidakTersedia(by: Actor, rangeId: string): Promise<TidakTersediaResult>;
  /** The signed-in Mitra Jasa's own ranges, soonest first; empty for anyone who is not one. */
  rentangTidakTersedia(by: Actor): Promise<RentangTidakTersedia[]>;
  /** One Mitra Jasa's 90-day scorecard from the Clock, for Admin Platform and for that Mitra Jasa themselves. */
  skorMitraJasa(by: Actor, mitraJasaId: string): Promise<ScorecardResult>;
  /** The signed-in Mitra Jasa's own 90-day scorecard; a suspended or ended one still reads it. */
  skorSaya(by: Actor): Promise<ScorecardResult>;
  /** The monthly scorecard review rows still open (the Tier 4 row's own query). */
  tinjauanTerbuka(by: Actor): Promise<TinjauanMitraJasa[]>;
  /** One Mitra Jasa's review rows, oldest month first. */
  tinjauanMitraJasa(by: Actor, mitraJasaId: string): Promise<TinjauanMitraJasa[]>;
  /** Admin Platform records the monthly scorecard review, which closes that month's row. */
  catatTinjauan(by: Actor, input: { mitraJasaId: string; tinjauanId: string; catatan: string | null }): Promise<CatatTinjauanResult>;
  /** The monthly tick: opens one review row per Mitra Jasa with the 90-day numbers as they stand. Idempotent. */
  tinjauSkorTick(now: Date): Promise<void>;
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

    buatMitraJasa: (by, email, input) => buatMitraJasa(deps, by, email, input),
    ubahProfil: (by, mitraJasaId, input) => ubahProfil(deps, by, mitraJasaId, input),
    ubahRekening: (by, mitraJasaId, input) => ubahRekening(deps, by, mitraJasaId, input),
    unggahBerkas: (by, mitraJasaId, input) => unggahBerkas(deps, by, mitraJasaId, input),
    ubahCoverage: (by, mitraJasaId, input) => ubahCoverage(deps, by, mitraJasaId, input),
    ubahStatus: (by, mitraJasaId, input) => ubahStatus(deps, by, mitraJasaId, input),
    semuaMitraJasa: (by) => semuaMitraJasa(deps, by),
    bacaMitraJasa: (by, mitraJasaId) => bacaMitraJasa(deps, by, mitraJasaId),
    mitraJasaCountByStatus: (by) => mitraJasaCountByStatus(deps, by),
    mitraJasaBelumLengkap: (by) => mitraJasaBelumLengkap(deps, by),
    mitraJasaTersedia: (by, input) => mitraJasaTersedia(deps, by, input),
    tambahTidakTersedia: (by, input) => tambahTidakTersedia(deps, by, input),
    hapusTidakTersedia: (by, rangeId) => hapusTidakTersedia(deps, by, rangeId),
    rentangTidakTersedia: (by) => rentangTidakTersedia(deps, by),
    skorMitraJasa: (by, mitraJasaId) => skorMitraJasa(deps, by, mitraJasaId),
    skorSaya: (by) => skorSaya(deps, by),
    tinjauanTerbuka: (by) => tinjauanTerbuka(deps, by),
    tinjauanMitraJasa: (by, mitraJasaId) => tinjauanMitraJasa(deps, by, mitraJasaId),
    catatTinjauan: (by, input) => catatTinjauan(deps, by, input),
    tinjauSkorTick: (now) => tinjauSkorTick(deps, now),
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
