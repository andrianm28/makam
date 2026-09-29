/**
 * Pengurusan at a DKI TPU: Saat Duka TPU, Perpanjangan TPU, Pengurusan IPTM
 * (spec, domain module 8; CONTEXT.md) — the Operator handling a Pemda permit on a
 * family's behalf, where the cycle is Dimakamkan → Dokumen Lengkap → IPTM
 * Diajukan → IPTM Terbit and the permit is the family's proof (there is no Hak
 * Pakai, and no Bukti Pemesanan, at a TPU).
 *
 * Owns table: pengurusan_tpu (the order). The TPU list and its "menerima makam
 * baru" flag stay the Lokasi module's data and are read here only through its
 * public functions; every price comes from Tariffs' `quote()`, which adds a Biaya
 * Layanan Platform only to a Lokasi Mitra order and so never to this one; the
 * Nomor Pemesanan and the Tagihan come from Billing; the working-time calculator
 * that answers the TPU window is Lokasi's (ticket 11); the "Ambil surat pengantar"
 * Tugas a confirmation creates is Field Work's. The submission is a family's own
 * wizard and so takes no actor; the confirmation and the offer of another TPU are
 * Admin Platform's staff writes, so they take one and record an Entri Audit.
 *
 * Built so far: the TPU section of "Pilih makam", the Saat Duka TPU submission
 * and the order page that follows it (ticket 44); the confirmation, the offer of
 * another TPU, the Tier 1 row and the "Ambil surat pengantar" Tugas (ticket 45).
 * The filing, the Perpanjangan and the Makam TPU record are tickets 46–48.
 */
import type { Actor } from "@/domain/identity";
import type { PengurusanDeps } from "./deps";
import { daftarDokumen } from "./dokumen";
import {
  konfirmasiTpuTerbuka,
  type KonfirmasiTpu,
} from "./konfirmasi-tpu-terbuka";
import {
  konfirmasiSaatDukaTpu,
  type KonfirmasiSaatDukaTpuResult,
} from "./konfirmasi-saat-duka-tpu";
import { pilihanSaatDukaTpu, type KartuTpu, type PilihanSaatDukaTpuQuery } from "./pilihan";
import { placeSaatDukaTpu, type PlaceSaatDukaTpuInput, type PlaceSaatDukaTpuResult } from "./saat-duka-tpu";
import { jawabTpuLain, tawarkanTpuLain, type JawabTpuLainResult, type TawarkanTpuLainResult } from "./tawarkan-tpu-lain";
import { orderForStaff, orderOf, pesananSaya, type PengurusanOrder } from "./reads";
import type { DokumenPemakamanDanPengajuan, JenisPenguburan, Kelayakan } from "./skema-pengurusan";

export type { Pemesan, PengurusanDeps } from "./deps";
export type { KartuTpu, PilihanSaatDukaTpuQuery } from "./pilihan";
export { JAM_KONFIRMASI_TPU } from "./pilihan";
export type { FotoIptm, PlaceSaatDukaTpuInput, PlaceSaatDukaTpuResult } from "./saat-duka-tpu";
export type { PengurusanOrder } from "./reads";
export { konfirmasiTpuTerbuka } from "./konfirmasi-tpu-terbuka";
export type { KonfirmasiTpu } from "./konfirmasi-tpu-terbuka";
export type { KonfirmasiSaatDukaTpuResult } from "./konfirmasi-saat-duka-tpu";
export type { JawabTpuLainResult, TawarkanTpuLainResult } from "./tawarkan-tpu-lain";
export { jawabTpuLainSchema, tawarkanTpuLainSchema } from "./tawarkan-tpu-lain";
export { konfirmasiSaatDukaTpuSchema, type KonfirmasiSaatDukaTpuInput } from "./konfirmasi-saat-duka-tpu";
export type { KontakTpu, PengurusanTpuKind, PengurusanTpuStatus } from "./schema";
export { pengurusanTpuKinds, pengurusanTpuStatuses } from "./schema";
export type { Dokumen, DokumenPemakamanDanPengajuan, JenisPenguburan, Kelayakan, KuburanTpu, PemegangHak, PemegangHakInput } from "./skema-pengurusan";
/**
 * The wizard's boundary schemas. A Client Component (the TPU form) takes these
 * from the module's own file rather than from this barrel, because a bundler keeps
 * a module whole and this barrel reaches the database: a value taken from it
 * would put `pg` in the browser. They are the same objects either way.
 */
export { jenisPenguburanSchema, kelayakanSchema, kuburanTpuSchema, pemegangHakSchema, FOTO_IPTM_MAX_BYTES } from "./skema-pengurusan";

export interface Pengurusan {
  /**
   * The "Pilih makam" TPU section: every DKI TPU that is taking new plots, each
   * with the same all-in TPU price (Biaya Pengurusan + Retribusi Pemda, no Biaya
   * Layanan Platform) and its confirmation promise on the 06:00–18:00 WIB window.
   * Filtered by the same city the Lokasi Mitra cards are, and narrowed to one TPU
   * for the submission screen. No actor.
   */
  pilihanSaatDukaTpu(query?: PilihanSaatDukaTpuQuery): Promise<KartuTpu[]>;
  /**
   * The two document sets a submission of this kind carries, as the form shows
   * them before the family commits: the burial set it brings and the filing set it
   * uploads, with the Pasal 17(2) documents added when the death was outside
   * Jakarta. The same function attaches them to the order, so a screen can never
   * show one set and the order carry another.
   */
  daftarDokumen(input: { jenis: JenisPenguburan; kelayakan: Kelayakan }): DokumenPemakamanDanPengajuan;
  /**
   * Places a Saat Duka TPU order for a proven email: Diajukan, with its Nomor
   * Pemesanan, the two-service-hour confirmation deadline on the TPU window, both
   * document sets attached, and no Tagihan.
   */
  placeSaatDukaTpu(input: PlaceSaatDukaTpuInput): Promise<PlaceSaatDukaTpuResult>;
  /** One Pengurusan order of that Akun, by its Nomor Pemesanan, or null. */
  orderOf(nomor: string, pemesan: { accountId: string }): Promise<PengurusanOrder | null>;
  /** The same order as Admin Platform reads it, by its Nomor Pemesanan, or null. */
  orderForStaff(by: Actor, nomor: string): Promise<PengurusanOrder | null>;
  /** Every Pengurusan order of that Akun, newest first (Akun Saya's Pesanan tab, ticket 27). */
  pesananSaya(pemesan: { accountId: string }): Promise<PengurusanOrder[]>;
  /**
   * Every Saat Duka TPU order still waiting for a confirmation: what the Antrean's
   * Tier 1 "Konfirmasi TPU Saat Duka" row is a projection of. The caller checks who may see it; this read takes no actor, so the worker can read it too.
   */
  konfirmasiTpuTerbuka(): Promise<KonfirmasiTpu[]>;
  /**
   * Confirms one Diajukan order: status Dikonfirmasi, the burial agreed with the
   * TPU, the pay-after Tagihan (due 3×24 h after the burial), the TPU office and
   * Admin Platform contacts, and the "Ambil surat pengantar" Tugas for a Petugas
   * Lapangan. Audited; the family message goes out once it has committed.
   */
  konfirmasiSaatDukaTpu(by: Actor, input: unknown): Promise<KonfirmasiSaatDukaTpuResult>;
  /**
   * Admin Platform offers the family another TPU for the same burial. The order
   * stays on the TPU the family applied to until they answer, so the Tier 1 row
   * stays open. Audited.
   */
  tawarkanTpuLain(by: Actor, input: unknown): Promise<TawarkanTpuLainResult>;
  /**
   * The Pemesan answers that offer: accepting moves the order onto the offered
   * TPU and starts the two-service-hour clock again, declining makes it Ditolak
   * with the reason. The family's own answer to their own order, so it takes no
   * actor and records no Entri Audit.
   */
  jawabTpuLain(pemesan: { accountId: string }, input: unknown): Promise<JawabTpuLainResult>;
}

export function createPengurusan(deps: PengurusanDeps): Pengurusan {
  const withAudit = deps;
  return {
    pilihanSaatDukaTpu: (query) => pilihanSaatDukaTpu(withAudit, query),
    daftarDokumen: (input) => daftarDokumen(input),
    placeSaatDukaTpu: (input) => placeSaatDukaTpu(withAudit, input),
    orderOf: (nomor, pemesan) => orderOf(withAudit, pemesan, nomor),
    orderForStaff: (by, nomor) => orderForStaff(withAudit, nomor),
    pesananSaya: (pemesan) => pesananSaya(withAudit, pemesan),
    konfirmasiTpuTerbuka: () => konfirmasiTpuTerbuka(withAudit),
    konfirmasiSaatDukaTpu: (by, input) => konfirmasiSaatDukaTpu(withAudit, by, input),
    tawarkanTpuLain: (by, input) => tawarkanTpuLain(withAudit, by, input),
    jawabTpuLain: (pemesan, input) => jawabTpuLain(withAudit, pemesan, input),
  };
}
