/**
 * Wakaf Tanah: Pengajuan Wakaf, the Nazhir list, Dirujuk (spec, domain module 12; ticket 58).
 *
 * Owns tables: wakaf_nazhir, wakaf_pengajuan, wakaf_riwayat, wakaf_catatan.
 *
 * The Operator only facilitates: it never receives land or money, so nothing here touches Billing and
 * no Tagihan can be attached to a Pengajuan. Admin Platform alone sees Pengajuan, internal notes and
 * the Survei Wakaf report; the Wakif sees their own Pengajuan, the notes written to them and their
 * documents, through reads of their own that never select an internal note.
 */
import type { Actor, WriteRefusal } from "@/domain/identity";
import type { WakafDeps } from "./deps";
import {
  daftarNazhir,
  hapusNazhir,
  nazhirUntukPilihan,
  tambahNazhir,
  ubahNazhir,
  type Nazhir,
  type NazhirPilihan,
  type NazhirResult,
} from "./nazhir";

import { ajukanWakaf, type AjukanWakafResult, type Wakif } from "./ajukan";

import { berkasUrlStaf, cocokkanNazhir, tulisCatatan, type CatatanResult } from "./catatan";
import { batalkanWakaf, berkasUrlWakif, pengajuanSaya, tambahBerkasWakaf, type BerkasUrlResult, type PengajuanWakafSaya, type UbahPengajuanWakifResult } from "./wakif";
import {
  pengajuanStaf,
  pengajuanTerbuka,
  pindahStatus,
  semuaPengajuan,
  type PengajuanStafResult,
  type PengajuanTerbuka,
  type PindahStatusResult,
  type RingkasanPengajuanWakaf,
} from "./tinjau";

export type { WakafDeps } from "./deps";
export type { CatatanResult } from "./catatan";
export type { BerkasUrlResult, PengajuanWakafSaya, UbahPengajuanWakifResult } from "./wakif";
export type {
  CatatanWakaf,
  PengajuanStafResult,
  PengajuanTerbuka,
  PengajuanWakafStaf,
  PindahStatusResult,
  RingkasanPengajuanWakaf,
  RiwayatWakaf,
} from "./tinjau";
export type { AjukanWakafResult, Wakif } from "./ajukan";
export type { Nazhir, NazhirPilihan, NazhirResult } from "./nazhir";

export interface Wakaf {
  /** The whole Nazhir list with contact and BWI number (Admin Platform only; empty for anyone else). */
  daftarNazhir(by: Actor): Promise<Nazhir[]>;
  /** The Nazhir the Pengajuan form offers: names, type and kab/kota only. */
  nazhirUntukPilihan(): Promise<NazhirPilihan[]>;
  /** Admin Platform adds a Nazhir to the list; audited. */
  tambahNazhir(by: Actor, input: unknown): Promise<NazhirResult>;
  /** Admin Platform changes a Nazhir; audited. */
  ubahNazhir(by: Actor, input: unknown): Promise<NazhirResult>;
  /** Admin Platform removes a Nazhir; Pengajuan that name it keep the name; audited. */
  hapusNazhir(by: Actor, input: unknown): Promise<NazhirResult>;
  /**
   * A Wakif files a Pengajuan Wakaf (the Akun is the one behind the session; Kirim's Kode Masuk step
   * makes it). Starts Diajukan and is told to the Wakif by email; no staff alert is raised, the
   * Pengajuan appears as a Tier 3 row.
   */
  ajukanWakaf(wakif: Wakif, input: unknown): Promise<AjukanWakafResult>;
  /** Every Pengajuan, newest first (Admin Platform only; empty for anyone else, Admin Lokasi included). */
  semuaPengajuan(by: Actor): Promise<RingkasanPengajuanWakaf[]>;
  /** One Pengajuan with everything, internal notes included (Admin Platform only). */
  pengajuanStaf(by: Actor, id: string): Promise<PengajuanStafResult>;
  /** Every Pengajuan still Diajukan with its first-contact deadline: the Tier 3 Antrean row (no actor, no alert). */
  pengajuanTerbuka(): Promise<PengajuanTerbuka[]>;
  /** Admin Platform moves a Pengajuan to its next status by hand; see `tinjau.ts` for what each status needs. */
  pindahStatus(by: Actor, input: unknown): Promise<PindahStatusResult>;
  /** Admin Platform writes a note: to the Wakif (shown in their Wakaf tab) or internal (hidden from them); audited. */
  tulisCatatan(by: Actor, input: unknown): Promise<CatatanResult>;
  /** Admin Platform matches a Pengajuan to a Nazhir from the list; audited. */
  cocokkanNazhir(by: Actor, input: unknown): Promise<CatatanResult>;
  /** A short-lived link to any document of a Pengajuan (Admin Platform only). */
  berkasUrlStaf(by: Actor, pengajuanId: string, berkasId: string): Promise<BerkasUrlResult | WriteRefusal>;
  /** The signed-in Wakif's own Pengajuan for the Wakaf tab: timeline, dates, notes to them, their uploads and the final scan; never an internal note or the survey. */
  pengajuanSaya(wakif: Wakif): Promise<PengajuanWakafSaya[]>;
  /** The Wakif cancels until Menunggu Ikrar; told by email. */
  batalkanWakaf(wakif: Wakif, input: unknown): Promise<UbahPengajuanWakifResult>;
  /** The Wakif adds documents later (optional at filing). */
  tambahBerkasWakaf(wakif: Wakif, input: unknown): Promise<UbahPengajuanWakifResult>;
  /** A short-lived link to one of the Wakif's own documents, or the final scan. */
  berkasUrl(wakif: Wakif, pengajuanId: string, berkasId: string): Promise<BerkasUrlResult>;
}

export function createWakaf(deps: WakafDeps): Wakaf {
  return {
    daftarNazhir: (by) => daftarNazhir(deps, by),
    nazhirUntukPilihan: () => nazhirUntukPilihan(deps),
    tambahNazhir: (by, input) => tambahNazhir(deps, by, input),
    ubahNazhir: (by, input) => ubahNazhir(deps, by, input),
    hapusNazhir: (by, input) => hapusNazhir(deps, by, input),
    ajukanWakaf: (wakif, input) => ajukanWakaf(deps, wakif, input),
    semuaPengajuan: (by) => semuaPengajuan(deps, by),
    pengajuanStaf: (by, id) => pengajuanStaf(deps, by, id),
    pengajuanTerbuka: () => pengajuanTerbuka(deps),
    pindahStatus: (by, input) => pindahStatus(deps, by, input),
    tulisCatatan: (by, input) => tulisCatatan(deps, by, input),
    cocokkanNazhir: (by, input) => cocokkanNazhir(deps, by, input),
    berkasUrlStaf: (by, pengajuanId, berkasId) => berkasUrlStaf(deps, by, pengajuanId, berkasId),
    pengajuanSaya: (wakif) => pengajuanSaya(deps, wakif),
    batalkanWakaf: (wakif, input) => batalkanWakaf(deps, wakif, input),
    tambahBerkasWakaf: (wakif, input) => tambahBerkasWakaf(deps, wakif, input),
    berkasUrl: (wakif, pengajuanId, berkasId) => berkasUrlWakif(deps, wakif, pengajuanId, berkasId),
  };
}
