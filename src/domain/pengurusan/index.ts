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
import { placePengurusanIptm, placeSaatDukaTpu, type PlacePengurusanIptmInput, type PlacePengurusanIptmResult, type PlaceSaatDukaTpuInput, type PlaceSaatDukaTpuResult } from "./saat-duka-tpu";
import {
  pembayaranBerkasTick,
  pengajuanBerkasTerbuka,
  periksaBerkasTerbuka,
  tolakPtsp,
  type PengajuanBerkasTerbuka,
  type PeriksaBerkasTerbuka,
  type TolakPtspResult,
} from "./pengurusan-berkas";
import { jawabTpuLain, tawarkanTpuLain, type JawabTpuLainResult, type TawarkanTpuLainResult } from "./tawarkan-tpu-lain";
import {
  ajukanIptm,
  batalkanPengurusan,
  catatDimakamkan,
  deskripsiMakamTpu,
  iptmScanUrl,
  makamTpuSaya,
  pengajuanIptmTerbuka,
  periksaDokumen,
  perluTindakanBerkas,
  suratKuasa,
  suratKuasaPdfUrl,
  suratKuasaUntukCetak,
  suratKuasaUntukStaf,
  terbitkanIptm,
  unggahDokumenPengajuan,
  type AjukanIptmResult,
  type BatalkanPengurusanResult,
  type CatatDimakamkanResult,
  type MakamTpu,
  type PengajuanIptmTerbuka,
  type PeriksaDokumenResult,
  type PerluTindakanBerkas,
  type SuratKuasa,
  type TerbitkanIptmResult,
  type UnggahDokumenResult,
} from "./pengajuan-iptm";
import { orderForStaff, orderOf, pesananSaya, type PengurusanOrder } from "./reads";
import type { DokumenPemakamanDanPengajuan, JenisPenguburan, Kelayakan } from "./skema-pengurusan";

export type { Pemesan, PengurusanDeps } from "./deps";
export type { KartuTpu, PilihanSaatDukaTpuQuery } from "./pilihan";
export { JAM_KONFIRMASI_TPU } from "./pilihan";
export type { FotoIptm, PlacePengurusanIptmInput, PlacePengurusanIptmResult, PlaceSaatDukaTpuInput, PlaceSaatDukaTpuResult } from "./saat-duka-tpu";
import { cekTpuTerbuka, koreksiIptmBerakhir, mintaPerbaikan, placePerpanjanganTpu, putuskanCekTpu } from "./perpanjangan-tpu";
import type { CekTpuTerbuka, KoreksiIptmBerakhirResult, MintaPerbaikanResult, PlacePerpanjanganTpuInput, PlacePerpanjanganTpuResult, PutuskanCekTpuResult } from "./perpanjangan-tpu";
export type { CekTpuTerbuka, KoreksiIptmBerakhirResult, MintaPerbaikanResult, PlacePerpanjanganTpuInput, PlacePerpanjanganTpuResult, PutuskanCekTpuResult };
export { HARI_KERJA_CEK_TPU, koreksiIptmBerakhirSchema, mintaPerbaikanSchema, putuskanCekTpuSchema } from "./perpanjangan-tpu";
export { pembayaranBerkasTick, tolakPtspSchema, HARI_KERJA_AJUKAN_BERKAS, HARI_KERJA_PERIKSA_BERKAS } from "./pengurusan-berkas";
export type { PengajuanBerkasTerbuka, PeriksaBerkasTerbuka, TagihanBerkas, TolakPtspResult } from "./pengurusan-berkas";
export type { PengurusanOrder } from "./reads";
export {
  ajukanIptmSchema,
  batalkanSchema as batalkanPengurusanSchema,
  catatDimakamkanSchema,
  nomorPengurusanSchema,
  terbitkanIptmSchema,
  unggahSchema as unggahDokumenPengajuanSchema,
} from "./pengajuan-iptm";
export { BERKAS_MAX_BYTES, HARI_BERKAS_PENGAJUAN, NAMA_OPERATOR_SURAT_KUASA } from "./pengajuan-iptm";
export type {
  AjukanIptmResult,
  BatalkanPengurusanResult,
  CatatDimakamkanResult,
  MakamTpu,
  PengajuanIptmTerbuka,
  PeriksaDokumenResult,
  PerluTindakanBerkas,
  SuratKuasa,
  TerbitkanIptmResult,
  UnggahDokumenResult,
} from "./pengajuan-iptm";
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
  /**
   * Places a filing-only Pengurusan IPTM for a proven email ("Sudah dimakamkan? Kami urus IPTM-nya", ticket 47):
   * Dimakamkan, its Nomor Pemesanan, the filing documents due in 7 days, and no Tagihan until Admin Platform has checked them.
   */
  placePengurusanIptm(input: PlacePengurusanIptmInput): Promise<PlacePengurusanIptmResult>;
  /**
   * Places a Perpanjangan TPU for the Pemegang Hak of a Makam TPU (ticket 48): Diajukan from 3 months before the IPTM's expiry,
   * with the expiry the form gave, the filing documents to upload and no Tagihan.
   */
  placePerpanjanganTpu(input: PlacePerpanjanganTpuInput): Promise<PlacePerpanjanganTpuResult>;
  /** Admin Platform's check finds a Perpanjangan TPU document that needs fixing, before any Tagihan: Perlu Perbaikan, no charge. Audited. */
  mintaPerbaikan(by: Actor, input: unknown): Promise<MintaPerbaikanResult>;
  /** The TPU's answer to a past-grace Perpanjangan TPU, recorded by Admin Platform: on to the document check, or Ditolak with the reason and no charge. Audited. */
  putuskanCekTpu(by: Actor, input: unknown): Promise<PutuskanCekTpuResult>;
  /** Admin Platform corrects the IPTM expiry date read off the photo, until a Tagihan is issued. Audited with the reason. */
  koreksiIptmBerakhir(by: Actor, input: unknown): Promise<KoreksiIptmBerakhirResult>;
  /** Every past-grace Perpanjangan TPU waiting for the TPU's answer: the Antrean's Tier 3 past-grace TPU check (1 working day). No actor: the caller checks `antrean.lihat`. */
  cekTpuTerbuka(): Promise<CekTpuTerbuka[]>;
  /** Every filing-only order whose documents are all in and unchecked: the Antrean's Tier 3 document check (1 working day). No actor: the caller checks `antrean.lihat`. */
  periksaBerkasTerbuka(): Promise<PeriksaBerkasTerbuka[]>;
  /** Every paid filing-only order waiting to be filed: the Antrean's Tier 3 filing row (3 working days after Lunas). No actor: the caller checks `antrean.lihat`. */
  pengajuanBerkasTerbuka(): Promise<PengajuanBerkasTerbuka[]>;
  /**
   * Follows the pay-first Tagihan of every Menunggu Pembayaran filing-only order: Lunas makes it Diproses, a lapsed
   * (Dibatalkan) Tagihan makes the order Dibatalkan. Idempotent; the worker's tick (`now` defaults to the Clock).
   */
  pembayaranBerkasTick(now?: Date): Promise<void>;
  /**
   * Admin Platform records the PTSP's answer to a filing: a fixable rejection goes back to Perlu Perbaikan (refiled at
   * no charge), a final one is Ditolak with the reason and refunds the whole Tagihan. Audited.
   */
  tolakPtsp(by: Actor, input: unknown): Promise<TolakPtspResult>;
  /** One Pengurusan order of that Akun, by its Nomor Pemesanan, or null. */
  orderOf(nomor: string, pemesan: { accountId: string }): Promise<PengurusanOrder | null>;
  /** The same order as Admin Platform reads it, by its Nomor Pemesanan, or null. */
  orderForStaff(by: Actor, nomor: string): Promise<PengurusanOrder | null>;
  /** Every Pengurusan order of that Akun, newest first (Akun Saya's Pesanan tab, ticket 27). */
  pesananSaya(pemesan: { accountId: string }): Promise<PengurusanOrder[]>;
  /**
   * Every Saat Duka TPU order still waiting for a confirmation: what the Antrean's
   * Tier 1 "Konfirmasi TPU Saat Duka" row is a projection of. This read takes no actor (so the worker can read it too), which means
   * the gate moved to the callers: a caller must check `antrean.lihat` (Admin Platform only) before
   * showing the result to anyone. The Antrean checks it in `antrean()`, the staff page through `staffMenuActor`.
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
  /**
   * Admin Platform records the burial (Dimakamkan): starts the pay-after Tagihan's overdue clock and
   * the 7-day window for the filing documents. Audited (ticket 46).
   */
  catatDimakamkan(by: Actor, input: unknown): Promise<CatatDimakamkanResult>;
  /** The Pemesan uploads one filing document of the order's checklist (the signed Surat Kuasa is one), while it is Dimakamkan. */
  unggahDokumenPengajuan(pemesan: { accountId: string }, input: unknown): Promise<UnggahDokumenResult>;
  /** The Surat Kuasa to print and sign: PT JKP, the filing staff member and the Pemegang Hak; null when it is not the Pemesan's or not yet confirmed. */
  suratKuasa(pemesan: { accountId: string }, nomor: string): Promise<SuratKuasa | null>;
  /** The Surat Kuasa as a PDF through the PdfRenderer, kept in the private FileStore: a 5-minute signed URL for its own Pemesan, null otherwise. */
  suratKuasaPdfUrl(pemesan: { accountId: string }, nomor: string): Promise<string | null>;
  /** The Surat Kuasa for the PdfRenderer's page; no actor, so the caller must have verified the order's signed render link. */
  suratKuasaUntukCetak(nomor: string): Promise<SuratKuasa | null>;
  /** The same page for Admin Platform. */
  suratKuasaUntukStaf(by: Actor, nomor: string): Promise<SuratKuasa | null>;
  /** Admin Platform checks the filing documents: Dokumen Lengkap, refused while one is missing. Audited. */
  periksaDokumen(by: Actor, input: unknown): Promise<PeriksaDokumenResult>;
  /** Admin Platform files on JakEVO: IPTM Diajukan, optionally with a Berkas IPTM Tugas Lapangan for the originals. Audited. */
  ajukanIptm(by: Actor, input: unknown): Promise<AjukanIptmResult>;
  /**
   * Admin Platform uploads the IPTM scan and its expiry: IPTM Terbit, the Makam TPU created or updated,
   * the scan sent to the Pemesan and the Pemegang Hak whatever the Tagihan's status. Audited.
   */
  terbitkanIptm(by: Actor, input: unknown): Promise<TerbitkanIptmResult>;
  /** The Pemesan cancels before the IPTM is filed: an unpaid Tagihan is voided, a paid one gets a refund request (the Biaya Pengurusan kept from Dimakamkan on). */
  batalkanPengurusan(pemesan: { accountId: string }, input: unknown): Promise<BatalkanPengurusanResult>;
  /** The Akun's Makam TPU records (its Makam tab). */
  makamTpuSaya(pemesan: { accountId: string }): Promise<MakamTpu[]>;
  /** The grave of a Makam TPU, ready to prefill the TPU Layanan order's grave description. */
  deskripsiMakamTpu(pemesan: { accountId: string }, makamTpuId: string): Promise<{ tpuId: string; blokNomor: string; almarhumName: string } | null>;
  /** A short-lived link to the order's IPTM scan, for its own Pemesan. */
  iptmScanUrl(pemesan: { accountId: string }, nomor: string): Promise<string | null>;
  /** The Pemesan's Dimakamkan orders with filing documents still missing (Perlu tindakan). */
  perluTindakanBerkas(pemesan: { accountId: string }): Promise<PerluTindakanBerkas[]>;
  /** Every Dokumen Lengkap order waiting to be filed: the Antrean's Tier 3 "IPTM filing" row reads it. No actor: the caller checks `antrean.lihat`. */
  pengajuanIptmTerbuka(): Promise<PengajuanIptmTerbuka[]>;
}

export function createPengurusan(deps: PengurusanDeps): Pengurusan {
  const withAudit = deps;
  return {
    pilihanSaatDukaTpu: (query) => pilihanSaatDukaTpu(withAudit, query),
    daftarDokumen: (input) => daftarDokumen(input),
    placePengurusanIptm: (input) => placePengurusanIptm(withAudit, input),
    placePerpanjanganTpu: (input) => placePerpanjanganTpu(withAudit, input),
    mintaPerbaikan: (by, input) => mintaPerbaikan(withAudit, by, input),
    putuskanCekTpu: (by, input) => putuskanCekTpu(withAudit, by, input),
    koreksiIptmBerakhir: (by, input) => koreksiIptmBerakhir(withAudit, by, input),
    cekTpuTerbuka: () => cekTpuTerbuka(withAudit),
    periksaBerkasTerbuka: () => periksaBerkasTerbuka(withAudit),
    pengajuanBerkasTerbuka: () => pengajuanBerkasTerbuka(withAudit),
    pembayaranBerkasTick: (now) => pembayaranBerkasTick(withAudit, now ?? deps.clock.now()),
    tolakPtsp: (by, input) => tolakPtsp(withAudit, by, input),
    placeSaatDukaTpu: (input) => placeSaatDukaTpu(withAudit, input),
    orderOf: (nomor, pemesan) => orderOf(withAudit, pemesan, nomor),
    orderForStaff: (by, nomor) => orderForStaff(withAudit, nomor),
    pesananSaya: (pemesan) => pesananSaya(withAudit, pemesan),
    konfirmasiTpuTerbuka: () => konfirmasiTpuTerbuka(withAudit),
    konfirmasiSaatDukaTpu: (by, input) => konfirmasiSaatDukaTpu(withAudit, by, input),
    tawarkanTpuLain: (by, input) => tawarkanTpuLain(withAudit, by, input),
    jawabTpuLain: (pemesan, input) => jawabTpuLain(withAudit, pemesan, input),
    catatDimakamkan: (by, input) => catatDimakamkan(withAudit, by, input),
    unggahDokumenPengajuan: (pemesan, input) => unggahDokumenPengajuan(withAudit, pemesan, input),
    suratKuasa: (pemesan, nomor) => suratKuasa(withAudit, pemesan, nomor),
    suratKuasaPdfUrl: (pemesan, nomor) => suratKuasaPdfUrl(withAudit, pemesan, nomor),
    suratKuasaUntukCetak: (nomor) => suratKuasaUntukCetak(withAudit, nomor),
    suratKuasaUntukStaf: (by, nomor) => suratKuasaUntukStaf(withAudit, by, nomor),
    periksaDokumen: (by, input) => periksaDokumen(withAudit, by, input),
    ajukanIptm: (by, input) => ajukanIptm(withAudit, by, input),
    terbitkanIptm: (by, input) => terbitkanIptm(withAudit, by, input),
    batalkanPengurusan: (pemesan, input) => batalkanPengurusan(withAudit, pemesan, input),
    makamTpuSaya: (pemesan) => makamTpuSaya(withAudit, pemesan),
    deskripsiMakamTpu: (pemesan, id) => deskripsiMakamTpu(withAudit, pemesan, id),
    iptmScanUrl: (pemesan, nomor) => iptmScanUrl(withAudit, pemesan, nomor),
    perluTindakanBerkas: (pemesan) => perluTindakanBerkas(withAudit, pemesan),
    pengajuanIptmTerbuka: () => pengajuanIptmTerbuka(withAudit),
  };
}
