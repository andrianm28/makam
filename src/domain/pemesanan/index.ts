/**
 * Pemesanan Makam at a Lokasi Mitra: Saat Duka, Terencana, a further burial
 * under an existing Hak Pakai (spec, domain module 6; CONTEXT.md).
 *
 * Owns table: pemesanan_makam and its documents (pemesanan_berkas). One order is
 * one grave for one Almarhum; the plot itself is assigned by the Lokasi at
 * confirmation, and the Tagihan is issued then, so nothing is billed at
 * submission.
 *
 * Built so far: the Saat Duka wizard's "Pilih makam" list, its Kirim (Diajukan,
 * with a Nomor Pemesanan and the confirmation deadline the Lokasi's Jam
 * Operasional promised), the order page that follows it, the Lokasi's
 * confirmation of an order (a cleared Tersedia Petak → an Aktif Hak Pakai → a
 * pay-after Tagihan), the family documents on an order and the Lokasi's
 * checklist, and the re-alert of an order still unconfirmed. The alternative,
 * decline and cancellation are ticket 24.
 */
import type { Actor } from "@/domain/identity";
import type { Pemesan } from "./deps";
import type { PemesananDeps } from "./deps";
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

export type { PemesananDeps, Pemesan, PemesananDiajukan, PemesananDikonfirmasi, PemesananNotifikasi } from "./deps";
export type { GrupSaatDuka, PilihanSaatDuka, PilihanSaatDukaQuery } from "./pilihan";
export { JAM_KONFIRMASI_SAAT_DUKA, kartuAwal } from "./pilihan";
export type { PemegangHakInput, PlaceSaatDukaInput, PlaceSaatDukaResult } from "./saat-duka";
export { konfirmasiSaatDukaSchema, type KonfirmasiSaatDukaInput, type KonfirmasiSaatDukaResult } from "./konfirmasi-saat-duka";
export type { DokumenOrder, OrderAntrean, OrderStaf } from "./reads-staf";
export type { CentangDokumenInput, DokumenResult, UnggahDokumenInput } from "./berkas";
export type { LangkahOrder, PemesananOrder } from "./reads";
export { timelineOrder } from "./reads";
export { JAM_REALERT_SAAT_DUKA, type RealertHasil } from "./realert";
export { realertKonfirmasiSaatDukaTick } from "./realert";
export { DOKUMEN_MAX_BYTES, DOKUMEN_URL_SECONDS, centangDokumenSchema, unggahDokumenSchema } from "./berkas";
export type { PemegangHak, PemesananKind, PemesananStatus } from "./schema";

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
}

export function createPemesanan(deps: PemesananDeps): Pemesanan {
  return {
    pilihanSaatDuka: (query) => pilihanSaatDuka(deps, query),
    placeSaatDuka: (input) => placeSaatDuka(deps, input),
    orderOf: (nomor, pemesan) => orderOf(deps, pemesan, nomor),
    konfirmasiSaatDuka: (by, input) => konfirmasiSaatDuka(deps, by, input),
    orderUntukStaf: (by, nomor) => orderUntukStaf(deps, by, nomor),
    orderUntukStafTerbaru: (by, lokasiId) => orderUntukStafTerbaru(deps, by, lokasiId),
    antreanKonfirmasi: (lokasiId) => antreanKonfirmasi(deps, lokasiId),
    konfirmasiLewatTenggat: () => konfirmasiLewatTenggat(deps, deps.clock.now()),
    konfirmasiTerlambat: (lokasiId) => konfirmasiTerlambat(deps, lokasiId),
    unggahDokumen: (pemesan, input) => unggahDokumen(deps, pemesan, input),
    centangDokumen: (by, input) => centangDokumen(deps, by, input),
    urlDokumen: (pemesan, nomor, nama) => urlDokumen(deps, pemesan, nomor, nama),
    urlDokumenUntukStaf: (by, nomor, nama) => urlDokumenUntukStaf(deps, by, nomor, nama),
  };
}

/** The worker's tick, as the scheduler registry calls it: the Saat Duka re-alert (ticket 23). */
export const pemesananRealertTick = realertKonfirmasiSaatDukaTick;
