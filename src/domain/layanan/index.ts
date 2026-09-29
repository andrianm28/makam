/**
 * Layanan and Paket Layanan (spec, domain module 9): the one global Layanan
 * catalog kept by Admin Platform, which Layanan each Lokasi Mitra offers and
 * which are offered at a DKI TPU, the prices that go with them, the Paket
 * Layanan definitions, and **the order a family places for a grave and the work
 * that order becomes**.
 *
 * Owns tables: layanan_layanan, layanan_varian, layanan_penawaran, layanan_paket,
 * layanan_paket_item, pesanan_layanan, pesanan_layanan_item, pekerjaan_layanan,
 * pekerjaan_layanan_bukti, pengembalian_layanan.
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
 * Left to later tickets: a Paket Layanan's recurring cycles (54), the Mitra Jasa
 * who fulfils a job at a TPU (55, 56), a Keluhan, a Penilaian and a job's
 * Pencairan (51), Layanan at a DKI TPU (56), and Layanan added at a non–standalone
 * checkout — a Saat Duka's hari-H items, a Terencana's empty-plot items, a
 * Perpanjangan's optional step (53).
 */
import type { Actor } from "@/domain/identity";
import type { SetHargaLayananInput } from "@/domain/tariffs";
import type { LayananDeps, PemesanLayanan } from "./deps";
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

export type { LayananDeps, PemesanLayanan, LayananNotifikasi, PesananLayananTerbit, PekerjaanSelesai } from "./deps";
export {
  buktiPerJenis,
  buktiValues,
  frekuensiValues,
  jenisLayananValues,
  pekerjaanLayananStatuses,
  pesananLayananStatuses,
  type Bukti,
  type BuktiPekerjaan,
  type Frekuensi,
  type JenisLayanan,
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
export { HARI_TERLAMBAT, batasTerlambat, jendelaKerja, sudahLewatBatas } from "./pekerjaan";
export type { PekerjaanUntukStaf, TerlambatTerbaca } from "./pekerjaan";
export { JENDELA_TARGET_HARI, jendelaTarget, targetPalingDini } from "./pesanan";
export type { AlasanTolakPesanan, PesananLayananOrder, PesananLayananItemTerbaca, PlacePesananLayananResult } from "./pesanan";
export { batasBatal, bolehDibatalkan } from "./batal";
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
  };
}

/**
 * The worker's tick: a job two days past its target date with no completion is
 * flagged Terlambat, which closes nothing by itself and changes nothing already
 * finished. Idempotent — running it twice for the same `now` is harmless, and a
 * job that is already flagged keeps the moment it was first noticed.
 */
export { tandaiTerlambat };
