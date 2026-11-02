/**
 * Kedukaan (ADR 0010): Permintaan Kedukaan for a Layanan Kedukaan (Rumah Duka, Mobil Jenazah,
 * Jasa Cargo Jenazah, Jasa Repatriasi Jenazah, Peti Jenazah, Bunga Duka Cita) or a Konsultasi
 * Rencana Pemakaman, which the Operator arranges itself after a first contact.
 *
 * Owns tables: kedukaan_permintaan, kedukaan_riwayat.
 */
import type { Actor } from "@/domain/identity";
import type { KedukaanDeps } from "./deps";
import {
  ajukanKedukaan,
  batalkanKedukaanSaya,
  permintaanKedukaan,
  permintaanKedukaanSaya,
  permintaanKedukaanTerbuka,
  pindahStatusKedukaan,
  semuaPermintaanKedukaan,
  type AjukanKedukaanResult,
  type BatalkanKedukaanSayaResult,
  type Peminta,
  type PermintaanKedukaan,
  type PermintaanKedukaanTerbuka,
  type PindahStatusKedukaanInput,
  type PindahStatusKedukaanResult,
} from "./permintaan";

export interface Kedukaan {
  /** A family files a Permintaan Kedukaan (after a Kode Masuk); it starts Diajukan and the family is emailed. */
  ajukan(peminta: Peminta, input: unknown): Promise<AjukanKedukaanResult>;
  /** The family's own Permintaan, newest first. */
  milikSaya(accountId: string): Promise<PermintaanKedukaan[]>;
  /** The family cancels its own Permintaan while it is Diajukan. */
  batalkanSaya(accountId: string, permintaanId: string): Promise<BatalkanKedukaanSayaResult>;
  /** Every Permintaan, for Admin Platform. */
  semua(by: Actor): Promise<PermintaanKedukaan[]>;
  /** One Permintaan, for Admin Platform. */
  satu(by: Actor, permintaanId: string): Promise<PermintaanKedukaan | null>;
  /** Admin Platform moves a Permintaan on; audited and told to the family. */
  pindahStatus(by: Actor, permintaanId: string, input: PindahStatusKedukaanInput): Promise<PindahStatusKedukaanResult>;
  /** The Diajukan Permintaan with their first-contact deadline (the Antrean's projection). */
  terbuka(): Promise<PermintaanKedukaanTerbuka[]>;
}

export function createKedukaan(deps: KedukaanDeps): Kedukaan {
  return {
    ajukan: (peminta, input) => ajukanKedukaan(deps, peminta, input),
    milikSaya: (accountId) => permintaanKedukaanSaya(deps, accountId),
    batalkanSaya: (accountId, permintaanId) => batalkanKedukaanSaya(deps, accountId, permintaanId),
    semua: (by) => semuaPermintaanKedukaan(deps, by),
    satu: (by, permintaanId) => permintaanKedukaan(deps, by, permintaanId),
    pindahStatus: (by, permintaanId, input) => pindahStatusKedukaan(deps, by, permintaanId, input),
    terbuka: () => permintaanKedukaanTerbuka(deps),
  };
}

export type { KedukaanDeps } from "./deps";
/** The Antrean's projection on its own, for the worker's Tier 1 alerts (which compose no Kedukaan module). */
export { permintaanKedukaanTerbuka };
export type {
  AjukanKedukaanResult,
  BatalkanKedukaanSayaResult,
  Peminta,
  PermintaanKedukaan,
  PermintaanKedukaanTerbuka,
  PindahStatusKedukaanInput,
  PindahStatusKedukaanResult,
};
export {
  jenisKedukaanValues,
  labelJenisKedukaan,
  labelStatusKedukaan,
  layananKedukaanValues,
  statusKedukaanValues,
  urgensiKedukaan,
  type JenisKedukaan,
  type StatusKedukaan,
} from "./skema";
