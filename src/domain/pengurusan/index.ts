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
 * Nomor Pemesanan comes from Billing's one series; the working-time calculator
 * that answers the TPU window is Lokasi's (ticket 11). No actor: these functions
 * are a family's own wizard, so the Server Actions are what authenticate and
 * check the role.
 *
 * Built so far: the TPU section of "Pilih makam", the Saat Duka TPU submission
 * and the order page that follows it (ticket 44). Confirmation, payment, the
 * filing, the Perpanjangan and the Makam TPU record are tickets 45–48.
 */
import type { PengurusanDeps } from "./deps";
import { daftarDokumen } from "./dokumen";
import { pilihanSaatDukaTpu, type KartuTpu, type PilihanSaatDukaTpuQuery } from "./pilihan";
import { placeSaatDukaTpu, type PlaceSaatDukaTpuInput, type PlaceSaatDukaTpuResult } from "./saat-duka-tpu";
import { orderOf, type PengurusanOrder } from "./reads";
import type { DokumenPemakamanDanPengajuan, JenisPenguburan, Kelayakan } from "./skema-pengurusan";

export type { Pemesan, PengurusanDeps } from "./deps";
export type { KartuTpu, PilihanSaatDukaTpuQuery } from "./pilihan";
export { JAM_KONFIRMASI_TPU } from "./pilihan";
export type { FotoIptm, PlaceSaatDukaTpuInput, PlaceSaatDukaTpuResult } from "./saat-duka-tpu";
export type { PengurusanOrder } from "./reads";
export type { PengurusanTpuKind, PengurusanTpuStatus } from "./schema";
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
}

export function createPengurusan(deps: PengurusanDeps): Pengurusan {
  return {
    pilihanSaatDukaTpu: (query) => pilihanSaatDukaTpu(deps, query),
    daftarDokumen: (input) => daftarDokumen(input),
    placeSaatDukaTpu: (input) => placeSaatDukaTpu(deps, input),
    orderOf: (nomor, pemesan) => orderOf(deps, pemesan, nomor),
  };
}
