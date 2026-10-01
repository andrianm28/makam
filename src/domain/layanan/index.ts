/**
 * Layanan and Paket Layanan (spec, domain module 9): the one global Layanan
 * catalog kept by Admin Platform, which Layanan each Lokasi Mitra offers and
 * which are offered at a DKI TPU, the prices that go with them, the Paket
 * Layanan definitions, and **the order a family places for a grave and the work
 * that order becomes**.
 *
 * Owns tables: layanan_layanan, layanan_varian, layanan_penawaran, layanan_paket,
 * layanan_paket_item, pesanan_layanan, pesanan_layanan_item, pekerjaan_layanan,
 * pekerjaan_layanan_bukti, pengembalian_layanan, keluhan_layanan, penilaian_layanan, and the two TPU tables of
 * ticket 56 (pekerjaan_layanan_tpu, pekerjaan_layanan_tpu_penugasan).
 *
 * Every price of a Layanan variant is a versioned tariff in the Tariffs module
 * (its price at a Lokasi Mitra, the DKI price, the Mitra Jasa rate), never a
 * column here: a variant with no price in force cannot be offered, so there is
 * no free pricing, and a Paket Layanan's price is the sum of its items' prices at
 * that place, from `quote()`.
 *
 * The order half is deliberately one seam with the rest of the platform: the
 * order issues its Tagihan through Billing (a pay-first `layanan` moment, whose
 * due date is Billing's own rule), the money that pays it schedules the jobs
 * through Billing's payment-effect hook, and a cancellation writes a refund
 * request that Billing's refund flow approves. Nothing here prices, charges,
 * pays out or receives money; it only says what was ordered for which grave, on
 * which date, and who has to do it.
 *
 * Every catalog and offering write is a staff write and only Admin Platform may
 * make one; each records an Entri Audit through the Audit Log module in the same
 * transaction, on the Lokasi Mitra when the write is about one, and re-checks
 * `authorize` itself. The order and its work are not: an order is a family's own
 * checkout (its Server Actions authenticate and check the role), and a job is
 * written by the Admin Lokasi of the Lokasi Mitra that has to do the work, which
 * the module checks against the job's own Lokasi.
 *
 * A finished job opens a 3×24 h Keluhan window; the Pemesan may file one Keluhan and give one
 * Penilaian, Admin Platform decides (rejected, a redo, or a refund of the item) and may override
 * what the job pays, and the job's Pencairan becomes due when the window closes with no Keluhan,
 * a Keluhan is rejected or the redo proof is shown (`./keluhan.ts`, ticket 51).
 *
 * Left to later tickets: a Paket Layanan's recurring cycles (54), the Mitra Jasa
 * who fulfils a job at a TPU (55, 56), Layanan at a DKI TPU (56), and Layanan added at a non–standalone
 * checkout — a Saat Duka's hari-H items, a Terencana's empty-plot items, a
 * Perpanjangan's optional step (53).
 */
import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import type { SetHargaLayananInput } from "@/domain/tariffs";
import type { LayananDeps, PemesanLayanan } from "./deps";
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
  hargaPesananLayanan,
  layananDiLokasi,
  penawaranLokasi,
  penawaranTpu,
  penawaranUntukPesanan,
  type HargaLayanan,
  type HargaPesananLayanan,
  type LayananDiLokasi,
  type LayananDiTempat,
  type LayananUntukPesanan,
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

import { cekHakPakai, pesananLayananOf, placePesananLayanan, type PesananLayananOrder, type PlacePesananLayananResult, type Tertulis } from "./pesanan";
import { pesananTertunda, jadwalkanTertunda as jadwalkanTertundaTick } from "./pembayaran";
import {
  pekerjaanTerlambat,
  pekerjaanUntukStaf,
  pekerjaanUntukStafTerbaru,
  selesaikanPekerjaan,
  tandaiTerlambat,
  unggahBuktiPekerjaan,
  mulaiPekerjaan,
  type BacaPekerjaanResult,
  type PekerjaanUntukStaf,
  type SelesaikanPekerjaanResult,
  type TerlambatTerbaca,
  type UnggahBuktiResult,
  type MulaiPekerjaanResult,
} from "./pekerjaan";
import { batalkanPekerjaan, pengembalianTerbuka, type BatalkanPekerjaanResult, type PengembalianTerbuka } from "./batal";
import {
  kirimPesanPemesan,
  kirimPesanStaf,
  threadUntukPemesan,
  threadUntukStaf,
  type BacaThreadResult,
  type KirimPesanResult,
} from "./pesan";
import {
  barisHariHTpu,
  hargaPesananTpu,
  jadwalkanHariHTpu,
  penawaranTpuUntukPesanan,
  pesananTpuOf,
  placePesananLayananTpu,
  type BarisHariHTpuResult,
  type FotoMakamTpu,
  type JadwalkanHariHTpuInput,
  type PesananTpuTerbaca,
  type PlacePesananLayananTpuResult,
} from "./tpu";
import {
  bacaPekerjaanTpu,
  jawabPenugasan,
  lepasPenugasan,
  pekerjaanTpuHariIniTanpaMitra,
  pekerjaanTpuPerluTindakan,
  pekerjaanTpuSaya,
  pekerjaanTpuUntukStaf,
  tandaiTidakDirespons,
  tugaskanMitraJasa,
  type BacaPekerjaanTpuResult,
  type JawabPenugasanResult,
  type LepasPenugasanResult,
  type PekerjaanTpuAntrean,
  type PekerjaanTpuSaya,
  type PekerjaanTpuStaf,
  type TugaskanMitraJasaResult,
} from "./penugasan-tpu";
import {
  ajukanKeluhan,
  beriPenilaian,
  daftarPenilaian,
  kerjakanUlangUntukLokasi,
  keluhanTerbuka,
  keluhanUntukPlatform,
  putuskanKeluhan,
  sesuaikanPencairanKeluhan,
  tutupJendelaKeluhan,
  type AjukanKeluhanResult,
  type BeriPenilaianResult,
  type KerjakanUlang,
  type KeluhanTerbuka,
  type KeluhanUntukPlatformResult,
  type PenilaianDenganPekerjaan,
  type PutuskanKeluhanResult,
  type SesuaikanPencairanResult,
  type TutupJendelaHasil,
} from "./keluhan";

export type {
  LayananDeps,
  LayananNotifikasi,
  PekerjaanMitraJasa,
  PekerjaanMitraJasaPort,
  PekerjaanSelesai,
  PemesanLayanan,
  PesanBaru,
  PesananLayananTerbit,
  PekerjaanTpuDitugaskan,
  PesananTpuTerbit,
} from "./deps";
export {
  buktiPerJenis,
  buktiValues,
  frekuensiValues,
  jenisLayananValues,
  mitraJasaStatuses,
  pekerjaanLayananStatuses,
  pesananLayananStatuses,
  type Bukti,
  type BuktiPekerjaan,
  type Frekuensi,
  type JenisLayanan,
  type MitraJasaStatus,
  type PekerjaanLayananStatus,
  type PesananLayananStatus,
} from "./schema";
export { buktiOf, proofOf } from "./katalog";
export { buktiPekerjaanValues } from "./pesanan-schema";
export type { ProofRequirement } from "./katalog";
export type {
  CreateLayananResult,
  HapusLayananResult,
  LayananKatalog,
  LayananTerbaca,
  NewLayanan,
  PerubahanLayanan,
  UbahLayananResult,
} from "./katalog";
export type { HapusVarianResult, NewVarian, TambahVarianResult, VarianDenganLayanan, VarianLayanan } from "./varian";
export type { StopLayananResult, TandaiBolehDiTpuResult, TawarkanLayananResult } from "./penawaran";
export type { BuatPaketResult, HapusPaketResult, NewPaket, PaketLayanan, PerubahanPaket, UbahPaketResult } from "./paket";
export type {
  BarisHargaPesanan,
  HargaLayanan,
  HargaPesananLayanan,
  LayananDiLokasi,
  LayananDiTempat,
  LayananUntukPesanan,
  Tempat,
  VarianDitawarkan,
  VarianUntukPesanan,
} from "./harga";
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
export type { BuatMitraJasaResult, MitraJasa, MitraJasaBelumLengkap, ReleasedJob, LangkahOnboarding } from "./mitra-jasa";
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
export { HARI_TERLAMBAT, batasTerlambat, jendelaKerja, sudahLewatBatas } from "./pekerjaan";
export type { KeluhanUntukStaf, PekerjaanUntukStaf, TerlambatTerbaca } from "./pekerjaan";
export { JENDELA_TARGET_HARI, jendelaTarget, targetPalingDini } from "./pesanan";
export type { AlasanTolakPesanan, PesananLayananOrder, PesananLayananItemTerbaca, PlacePesananLayananResult } from "./pesanan";
export { JAM_RESPON_PERTAMA_KELUHAN, JENDELA_KELUHAN_JAM, jendelaKeluhanBerakhir } from "./keluhan";
export type {
  AjukanKeluhanResult,
  BeriPenilaianResult,
  KerjakanUlang,
  KeluhanTerbaca,
  KeluhanTerbuka,
  KeluhanUntukPlatform,
  KeluhanUntukPlatformResult,
  PenilaianDenganPekerjaan,
  PenilaianTerbaca,
  PutuskanKeluhanResult,
  SesuaikanPencairanResult,
  TutupJendelaHasil,
} from "./keluhan";
export { keluhanStatuses, type KeluhanStatus } from "./schema";
export { batasBatal, bolehDibatalkan } from "./batal";
export { BATAS_JAWAB_JAM, batasJawabPenugasan } from "./penugasan-tpu";
export type {
  BacaPekerjaanTpuResult,
  JawabPenugasanResult,
  LepasPenugasanResult,
  PekerjaanTpuAntrean,
  PekerjaanTpuMitraJasa,
  PekerjaanTpuSaya,
  PekerjaanTpuStaf,
  PenugasanTerbuka,
  RiwayatPekerjaanMitraJasa,
  RiwayatPenugasan,
  TugaskanMitraJasaResult,
} from "./penugasan-tpu";
export { hariPemakaman, namaDepan } from "./tpu";
export type {
  AlasanTolakPesananTpu,
  BarisHariHTpu,
  BarisHariHTpuResult,
  FotoMakamTpu,
  JadwalkanHariHTpuInput,
  PekerjaanTpuPemesan,
  PesananTpuTerbaca,
  PlacePesananLayananTpuResult,
} from "./tpu";
export { portPekerjaanTpu } from "./port-pekerjaan-tpu";
export {
  FOTO_MAKAM_TPU_MAX_BYTES,
  itemHariHTpuSchema,
  jawabPenugasanSchema,
  lepasPenugasanSchema,
  makamTpuSchema,
  placePesananLayananTpuSchema,
  tugaskanMitraJasaSchema,
  type DeskripsiMakamTpu,
  type ItemHariHTpu,
} from "./tpu-skema";
export { pekerjaanTpuStatuses, penugasanHasilValues, type PekerjaanTpuStatus, type PenugasanHasil } from "./schema";
export type { BatalkanPekerjaanResult, PengembalianDiminta, PengembalianTerbuka } from "./batal";
export type { BuktiTerbaca } from "./bukti";
export { BUKTI_MAX_BYTES, buktiKurang, buktiLengkap, jenisBuktiDibutuhkan } from "./bukti";
/**
 * The Layanan order's boundary, for a Client Component's import graph: the
 * Zod schemas and types of the checkout and the three staff steps, taken from
 * this module's **own** file rather than from this barrel (a bundler keeps a
 * module whole, and this barrel reaches the database). They are the same objects
 * either way.
 */
export {
  BUKTI_URL_SECONDS,
  buktiDibutuhkan,
  buktiUntukPekerjaan,
  buktiUrl,
  jenisBuktiOf,
  simpanBukti,
  type BuktiTerbaca as BuktiPekerjaanTerbaca,
} from "./bukti";
export { EFEK_JADWALKAN, efekJadwalkanPekerjaan, jadwalkan, jadwalkanTertunda, pesananTertunda, type HasilJadwalkan, type JadwalkanDeps } from "./pembayaran";
/** The message thread (ticket 52): its public functions and what a reader sees. */
export type { BacaThreadResult, KirimPesanResult, PelaksanaTerbaca, PesanTerbaca, ThreadPekerjaan } from "./pesan";
/**
 * The thread's boundary for a Client Component's import graph: the Zod schema and the
 * plain constants of one message, taken from this module's **own** file rather than
 * from this barrel (which reaches the database).
 */
export {
  PESAN_FOTO_MAX_BYTES,
  PESAN_LAMPIRAN_MAX,
  PESAN_LAMPIRAN_TYPES,
  PESAN_MAKS_PANJANG,
  PESAN_URL_SECONDS,
  kirimPesanSchema,
  type KirimPesanInput,
} from "./pesan-skema";

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
  /* ── the order a family places for a grave (Lokasi Mitra) ── */

  /**
   * The Layanan a Lokasi Mitra offers for the order's checkout, in catalog order,
   * each variant with that variant's own price — the one place a family reads
   * before choosing. No actor: it is the public Lokasi page's own read.
   */
  penawaranUntukPesanan(lokasiId: string): Promise<LayananUntukPesanan[]>;
  /**
   * What one order of these variants costs, all in, at this instant: the items at
   * that place's price plus the one Biaya Layanan Platform a Tagihan at a Lokasi
   * Mitra carries. Null where a variant is not offered there, has no price in
   * force, or the total is past the QRIS cap.
   */
  hargaPesananLayanan(lokasiId: string, layananVariantIds: readonly string[]): Promise<HargaPesananLayanan | null>;
  /**
   * Whether a grave may take a Layanan order at all, and the number the family and
   * the Lokasi both know it by — **the same read `placePesananLayanan` decides on**,
   * so the checkout screen and the order that places cannot disagree about which
   * grave is open. Only a **Berakhir** Hak Pakai refuses; a given-back (`dibatalkan`)
   * one does not, by the owner's settled decision, and `perluVerifikasi` is reported
   * rather than refused (AC 1: the grave may be ordered for, and the job waits for
   * the Admin Lokasi to complete the record).
   */
  cekHakPakai(lokasiId: string, petakId: string): Promise<Tertulis>;
  /**
   * Places an order Layanan: one grave, one or more Layanan, a target date outside
   * each one's lead time, and the pay-first Tagihan issued with it. A Berakhir (or
   * given-back) Hak Pakai takes no further Layanan; a Hak Pakai flagged Perlu
   * Verifikasi may be ordered for, but its jobs wait for the Admin Lokasi to
   * complete it before the payment can schedule them.
   */
  placePesananLayanan(pemesan: PemesanLayanan, input: unknown): Promise<PlacePesananLayananResult>;
  /** One order by its Nomor Pesanan, as the Pemesan who placed it reads it, with every job and proof. */
  pesananLayananOf(nomor: string, pemesan: { accountId: string }): Promise<PesananLayananOrder | null>;
  /**
   * The Pemesan cancels one job, until H-1 or until it starts; a job already
   * flagged Terlambat may be cancelled for the lateness, which returns the
   * platform fee as well. What is owed is written as a refund request for the
   * Billing refund flow to approve; no money moves here.
   */
  batalkanPekerjaan(pemesan: PemesanLayanan, input: unknown): Promise<BatalkanPekerjaanResult>;
  /** Every refund request a cancellation has written, oldest first, for the refund flow to work through. */
  pengembalianTerbuka(): Promise<PengembalianTerbuka[]>;
  /** The orders whose jobs are still waiting for a Hak Pakai to be completed. */
  pesananTertunda(): Promise<{ pesananId: string; nomor: string; lokasiId: string; petakNomor: string }[]>;
  /**
   * The worker's tick that **releases** a held job: every order whose Tagihan is paid
   * and whose job is still waiting for its Hak Pakai is offered to the same scheduling
   * rule again, and moves if the Admin Lokasi has completed that Hak Pakai in the
   * meantime. Returns how many jobs moved; idempotent, as every tick is. Nothing can
   * schedule a held job any other way — the payment that would have is already
   * recorded — so this is what makes the gate a door and not a wall.
   */
  jadwalkanTertunda(now: Date): Promise<number>;

  /* ── fulfilling a job (the Admin Lokasi of that Lokasi Mitra) ── */

  /** One job as that Lokasi's staff read it, with what it must show and what is still missing. */
  pekerjaanUntukStaf(by: Actor, input: unknown): Promise<BacaPekerjaanResult>;
  /** Every open job of one Lokasi Mitra, soonest target date first. */
  pekerjaanUntukStafTerbaru(by: Actor, lokasiId: string): Promise<PekerjaanUntukStaf[]>;
  /** The Admin Lokasi starts a job: Sedang Dikerjakan. */
  mulaiPekerjaan(by: Actor, input: unknown): Promise<MulaiPekerjaanResult>;
  /** The Admin Lokasi captures one proof in the app, stamped with the camera's own moment. */
  unggahBuktiPekerjaan(by: Actor, input: unknown): Promise<UnggahBuktiResult>;
  /** The Admin Lokasi marks a job Selesai and the Pemesan is sent its proof link; refused until every required proof is there. */
  selesaikanPekerjaan(by: Actor, input: unknown): Promise<SelesaikanPekerjaanResult>;
  /** Every job currently Terlambat, oldest target date first (the Tier 2 row's list). */
  pekerjaanTerlambat(): Promise<TerlambatTerbaca[]>;
  /* ── the message thread of one job (ticket 52) ── */

  /**
   * One job's message thread as its Pemesan reads it: refused for anyone else's job.
   * The Pemesan sees a Mitra Jasa's first name and photo, and never a contact.
   */
  pesanPekerjaanUntukPemesan(pemesan: { accountId: string }, pekerjaanId: string): Promise<BacaThreadResult>;
  /**
   * The same thread as the job's Admin Lokasi, its assigned Mitra Jasa or Admin Platform
   * reads it; nobody else may read it at all.
   */
  pesanPekerjaanUntukStaf(by: Actor, pekerjaanId: string): Promise<BacaThreadResult>;
  /** The Pemesan writes into a job's thread; refused once the Keluhan window closed it. */
  kirimPesanPekerjaan(pemesan: PemesanLayanan, input: unknown): Promise<KirimPesanResult>;
  /** Staff or the fulfiller writes into a job's thread; a new one tells the Pemesan by email, without its text or photos. */
  kirimPesanPekerjaanStaf(by: Actor, input: unknown): Promise<KirimPesanResult>;

  /* ── Layanan at a DKI TPU, fulfilled by a Mitra Jasa (ticket 56) ── */

  /**
   * The Layanan a DKI TPU offers for an order, each variant at its DKI price alone (a
   * TPU Tagihan carries no platform fee); `hariH` narrows to what a Saat Duka checkout
   * may add. No actor: it is the public price list.
   */
  penawaranTpuUntukPesanan(options?: { hariH?: boolean }): Promise<LayananUntukPesanan[]>;
  /** What these variants cost at a TPU, all in; null where one is not offered or the total passes the QRIS cap. */
  hargaPesananTpu(layananVariantIds: readonly string[]): Promise<{ total: number; parts: { label: string; amount: number }[] } | null>;
  /**
   * Places an order Layanan at a DKI TPU by describing the grave (TPU, blok/nomor,
   * Almarhum, optional photo and pin), at DKI prices with a pay-first Tagihan. The
   * jobs wait for the payment, which schedules them.
   */
  placePesananLayananTpu(pemesan: PemesanLayanan, input: unknown, foto?: FotoMakamTpu | null): Promise<PlacePesananLayananTpuResult>;
  /**
   * The TPU jobs of one Nomor Pemesanan for the Pemesan who placed it (a standalone TPU
   * order, or the hari-H items of a Saat Duka TPU order), with the Mitra Jasa's first
   * name and photo once they have accepted.
   */
  pesananTpuOf(nomor: string, pemesan: { accountId: string }): Promise<PesananTpuTerbaca | null>;
  /** Prices hari-H items for a Saat Duka TPU order (or says why they cannot be offered): at submission and again at the confirmation. */
  barisHariHTpu(items: unknown, at?: Date): Promise<BarisHariHTpuResult>;
  /**
   * Creates the Dijadwalkan jobs of a confirmed Saat Duka TPU order, target = the burial
   * day. Pengurusan's confirmation calls it with its own transaction as `within`, so the
   * jobs and the Tagihan they are billed on commit together.
   */
  jadwalkanHariHTpu(input: JadwalkanHariHTpuInput, within?: Database): Promise<number>;
  /** Every Dijadwalkan TPU job with who holds it and what came before (Admin Platform). */
  pekerjaanTpuUntukStaf(by: Actor): Promise<PekerjaanTpuStaf[]>;
  /** One TPU job with the picker's candidates: Aktif Mitra Jasa covering the TPU and the Layanan and free on the date. */
  bacaPekerjaanTpu(by: Actor, pekerjaanId: string): Promise<BacaPekerjaanTpuResult>;
  /** Admin Platform hands a job to a Mitra Jasa the picker offers; the accept deadline is 12 h or H-1 18:00, whichever is sooner. Audited. */
  tugaskanMitraJasa(by: Actor, input: unknown): Promise<TugaskanMitraJasaResult>;
  /** Admin Platform takes a job off its Mitra Jasa to reassign it (counts as neither a decline nor a completion). Audited. */
  lepasPenugasan(by: Actor, input: unknown): Promise<LepasPenugasanResult>;
  /** The Mitra Jasa accepts or declines a job assigned to them, by the accept deadline. Audited. */
  jawabPenugasan(by: Actor, input: unknown): Promise<JawabPenugasanResult>;
  /** The signed-in Mitra Jasa's own jobs: the grave, the Layanan, the date and the photos, and never a family contact. */
  pekerjaanTpuSaya(by: Actor): Promise<PekerjaanTpuSaya>;
  /** The worker's tick: an assignment unanswered at its deadline becomes Tidak direspons and the job returns to the queue. Idempotent. */
  tandaiTidakDirespons(now: Date): Promise<number>;
  /** The Antrean's Tier 1 row: jobs due today with no Mitra Jasa who accepted. */
  pekerjaanTpuHariIniTanpaMitra(): Promise<PekerjaanTpuAntrean[]>;
  /** The Antrean's Tier 2 rows: jobs back in the queue after Tidak direspons, Ditolak or a release for reassignment. */
  pekerjaanTpuPerluTindakan(): Promise<PekerjaanTpuAntrean[]>;
  /* ── Keluhan and Penilaian (ticket 51) ── */

  /**
   * The Pemesan files a Keluhan on a finished job, within 3×24 h of the proof being shown to them.
   * One per job. The job becomes Keluhan and the Antrean's Tier 1 row exists from then, with a first
   * response due in 4 daytime hours (06:00–18:00 WIB).
   */
  ajukanKeluhan(pemesan: PemesanLayanan, input: unknown): Promise<AjukanKeluhanResult>;
  /** The Pemesan gives a finished job an optional 1–5 star Penilaian with a comment; once per job, and only Admin Platform reads it. */
  beriPenilaian(pemesan: PemesanLayanan, input: unknown): Promise<BeriPenilaianResult>;
  /**
   * Admin Platform decides an open Keluhan, with a note: rejected (the job is Selesai and its Pencairan
   * due), a redo (the Admin Lokasi gets a Kerjakan ulang row) or a refund of the job's line (asked of
   * Refunds). Audited.
   */
  putuskanKeluhan(by: Actor, input: unknown): Promise<PutuskanKeluhanResult>;
  /** Admin Platform overrides what the job pays its fulfiller after a Keluhan, with a mandatory note (Payouts records and audits it). */
  sesuaikanPencairanKeluhan(by: Actor, input: unknown): Promise<SesuaikanPencairanResult>;
  /** One Keluhan with the job, its proof, the Pemesan, the Penilaian and what the job pays: what Admin Platform decides on. */
  keluhanUntukPlatform(by: Actor, keluhanId: string): Promise<KeluhanUntukPlatformResult>;
  /** Every Penilaian, newest first: Admin Platform only (nobody else's read carries one). */
  daftarPenilaian(by: Actor): Promise<PenilaianDenganPekerjaan[]>;
  /** Every Keluhan waiting for Admin Platform's decision, oldest first: the Antrean's Tier 1 row and its counter. */
  keluhanTerbuka(): Promise<KeluhanTerbuka[]>;
  /** The redos one Lokasi Mitra owes: its Antrean Lokasi's Mendesak "Kerjakan ulang" rows. */
  kerjakanUlangUntukLokasi(by: Actor, lokasiId: string): Promise<KerjakanUlang[]>;
  /**
   * The worker's Keluhan window-close tick: a job whose proof was shown more than 3×24 h ago gets its
   * closing signal (the message thread reads it), and a job whose window closed with no Keluhan, or
   * whose Keluhan was rejected or redone, has its Pencairan made due. Idempotent, and retried while
   * the Pencairan item has not been written yet.
   */
  tutupJendelaKeluhan(now: Date): Promise<TutupJendelaHasil>;
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

export function createLayanan(deps: LayananDeps): Layanan {
  const now = () => deps.clock.now();
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
    penawaranUntukPesanan: (lokasiId) => penawaranUntukPesanan(deps, lokasiId, now()),
    hargaPesananLayanan: (lokasiId, ids) => hargaPesananLayanan(deps, lokasiId, ids, now()),
    cekHakPakai: (lokasiId, petakId) => cekHakPakai(deps, lokasiId, petakId),
    placePesananLayanan: (pemesan, input) => placePesananLayanan(deps, pemesan, input),
    pesananLayananOf: (nomor, pemesan) => pesananLayananOf(deps, nomor, pemesan),
    batalkanPekerjaan: (pemesan, input) => batalkanPekerjaan(deps, pemesan, input),
    pengembalianTerbuka: () => pengembalianTerbuka(deps),
    pesananTertunda: () => pesananTertunda({ db: deps.db, inventory: deps.inventory }),
    jadwalkanTertunda: (now) => jadwalkanTertundaTick({ db: deps.db, inventory: deps.inventory }, now),

    pekerjaanUntukStaf: (by, input) => pekerjaanUntukStaf(deps, by, input),
    pekerjaanUntukStafTerbaru: (by, lokasiId) => pekerjaanUntukStafTerbaru(deps, by, lokasiId),
    mulaiPekerjaan: (by, input) => mulaiPekerjaan(deps, by, input),
    unggahBuktiPekerjaan: (by, input) => unggahBuktiPekerjaan(deps, by, input),
    selesaikanPekerjaan: (by, input) => selesaikanPekerjaan(deps, by, input),
    pekerjaanTerlambat: () => pekerjaanTerlambat(deps),
    pesanPekerjaanUntukPemesan: (pemesan, pekerjaanId) => threadUntukPemesan(deps, pemesan, pekerjaanId),
    pesanPekerjaanUntukStaf: (by, pekerjaanId) => threadUntukStaf(deps, by, pekerjaanId),
    kirimPesanPekerjaan: (pemesan, input) => kirimPesanPemesan(deps, pemesan, input),
    kirimPesanPekerjaanStaf: (by, input) => kirimPesanStaf(deps, by, input),

    penawaranTpuUntukPesanan: (options) => penawaranTpuUntukPesanan(deps, now(), options),
    hargaPesananTpu: (ids) => hargaPesananTpu(deps, ids, now()),
    placePesananLayananTpu: (pemesan, input, foto) => placePesananLayananTpu(deps, pemesan, input, foto ?? null),
    pesananTpuOf: (nomor, pemesan) => pesananTpuOf(deps, nomor, pemesan),
    barisHariHTpu: (items, at) => barisHariHTpu(deps, items, at ?? now()),
    jadwalkanHariHTpu: (input, within) => jadwalkanHariHTpu(within ? { ...deps, db: within } : deps, input),
    pekerjaanTpuUntukStaf: (by) => pekerjaanTpuUntukStaf(deps, by),
    bacaPekerjaanTpu: (by, pekerjaanId) => bacaPekerjaanTpu(deps, by, pekerjaanId),
    tugaskanMitraJasa: (by, input) => tugaskanMitraJasa(deps, by, input),
    lepasPenugasan: (by, input) => lepasPenugasan(deps, by, input),
    jawabPenugasan: (by, input) => jawabPenugasan(deps, by, input),
    pekerjaanTpuSaya: (by) => pekerjaanTpuSaya(deps, by),
    tandaiTidakDirespons: (at) => tandaiTidakDirespons(deps.db, at),
    pekerjaanTpuHariIniTanpaMitra: () => pekerjaanTpuHariIniTanpaMitra(deps.db, now()),
    pekerjaanTpuPerluTindakan: () => pekerjaanTpuPerluTindakan(deps.db),
    ajukanKeluhan: (pemesan, input) => ajukanKeluhan(deps, pemesan, input),
    beriPenilaian: (pemesan, input) => beriPenilaian(deps, pemesan, input),
    putuskanKeluhan: (by, input) => putuskanKeluhan(deps, by, input),
    sesuaikanPencairanKeluhan: (by, input) => sesuaikanPencairanKeluhan(deps, by, input),
    keluhanUntukPlatform: (by, keluhanId) => keluhanUntukPlatform(deps, by, keluhanId),
    daftarPenilaian: (by) => daftarPenilaian(deps, by),
    keluhanTerbuka: () => keluhanTerbuka(deps),
    kerjakanUlangUntukLokasi: (by, lokasiId) => kerjakanUlangUntukLokasi(deps, by, lokasiId),
    tutupJendelaKeluhan: (now) => tutupJendelaKeluhan(deps, now),
  };
}

/**
 * The worker's tick: a job two days past its target date with no completion is
 * flagged Terlambat, which closes nothing by itself and changes nothing already
 * finished. Idempotent — running it twice for the same `now` is harmless, and a
 * job that is already flagged keeps the moment it was first noticed.
 */
export { tandaiTerlambat };
