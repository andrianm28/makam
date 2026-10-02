/**
 * What a manual Perpanjangan request is made of (ticket 41): the three paths and the documents each
 * collects, the input schemas of every step, the constants of the 30 days and the 2 working days, and
 * the shapes the reads return. No database here.
 */
import { z } from "zod";
import { itemCheckoutListSchema } from "@/domain/layanan/pesanan-schema";
import type { CatatanPerpanjangan } from "./aturan";
import { jalurManual, type JalurManual, type StatusPermohonan } from "./schema";

export { jalurManual, type JalurManual, type StatusPermohonan };

export const BERKAS_PERMOHONAN_MAX_BYTES = 3 * 1024 * 1024;
/** How long a document's signed URL works for the Admin Lokasi who reviews it. */
export const BERKAS_PERMOHONAN_URL_SECONDS = 5 * 60;
/** How long an approval stays valid, from the moment of approval. */
export const MASA_BERLAKU_PERSETUJUAN_HARI = 30;
/** A request is due this many working days (Lokasi calendar) after it is filed. */
export const TENGGAT_PERIKSA_HARI_KERJA = 2;

export interface JenisBerkas {
  kunci: string;
  label: string;
  wajib: boolean;
}

/** The documents each path collects (spec, stories 59, 60 and 61). */
const BERKAS_JALUR: Record<JalurManual, readonly JenisBerkas[]> = {
  ktp: [{ kunci: "ktp", label: "KTP Pemegang Hak", wajib: true }],
  ahli_waris: [
    { kunci: "akta_kematian", label: "Akta kematian Pemegang Hak", wajib: true },
    { kunci: "bukti_ahli_waris", label: "Bukti ahli waris", wajib: true },
    { kunci: "ktp", label: "KTP ahli waris", wajib: true },
  ],
  klaim: [
    { kunci: "ktp", label: "KTP pengklaim", wajib: true },
    { kunci: "bukti_hubungan", label: "Bukti hubungan keluarga dengan Almarhum", wajib: true },
    { kunci: "kwitansi_lama", label: "Kwitansi lama (bila ada)", wajib: false },
  ],
};

export const JALUR_LABEL: Record<JalurManual, string> = {
  ktp: "Unggah KTP",
  ahli_waris: "Ahli waris",
  klaim: "Klaim Hak Pakai",
};

/** The documents a path collects, in the order the form asks for them. */
export function berkasUntukJalur(jalur: JalurManual): readonly JenisBerkas[] {
  return BERKAS_JALUR[jalur];
}

export const berkasInputSchema = z.object({
  kunci: z.string().trim().min(1).max(40),
  body: z.instanceof(Uint8Array),
  contentType: z.string().trim().max(100),
});

const kontakFields = {
  nama: z.string().trim().min(1).max(200),
  nomorTelepon: z.string().trim().min(1).max(30),
  catatan: z.string().trim().max(1000).optional(),
};

export const ajukanPermohonanSchema = z.object({
  hakPakaiId: z.uuid(),
  jalur: z.enum(jalurManual),
  ...kontakFields,
  berkas: z.array(berkasInputSchema).max(10),
});
export type AjukanPermohonanInput = z.infer<typeof ajukanPermohonanSchema>;

export const perbaikiPermohonanSchema = z.object({
  permohonanId: z.uuid(),
  nama: kontakFields.nama.optional(),
  nomorTelepon: kontakFields.nomorTelepon.optional(),
  catatan: kontakFields.catatan,
  /** Only the documents that are replaced; the others stay. */
  berkas: z.array(berkasInputSchema).max(10),
});
export type PerbaikiPermohonanInput = z.infer<typeof perbaikiPermohonanSchema>;

export const batalkanPermohonanSchema = z.object({ permohonanId: z.uuid() });

export const pesanDariPermohonanSchema = z.object({
  permohonanId: z.uuid(),
  terms: z.number().int().min(1).max(100),
  /** The optional "Tambah Layanan" step, as on the direct path (ticket 53). */
  layanan: itemCheckoutListSchema.optional(),
});
export type PesanDariPermohonanInput = z.infer<typeof pesanDariPermohonanSchema>;

export const setujuiPermohonanSchema = z.object({
  permohonanId: z.uuid(),
  alasan: z.string().trim().min(1).max(500),
  /** The Admin Lokasi's correction of what the applicant typed, when the papers say otherwise. */
  nama: kontakFields.nama.optional(),
  nomorTelepon: kontakFields.nomorTelepon.optional(),
  /** The end date of a Hak Pakai flagged Perlu Verifikasi whose import had none. */
  endDate: z.iso.date().optional(),
});
export type SetujuiPermohonanInput = z.infer<typeof setujuiPermohonanSchema>;

export const putuskanPermohonanSchema = z.object({
  permohonanId: z.uuid(),
  alasan: z.string().trim().min(1).max(500),
});
export type PutuskanPermohonanInput = z.infer<typeof putuskanPermohonanSchema>;

/** One request as its applicant and the Admin Lokasi read it. */
export interface PermohonanTercatat {
  id: string;
  hakPakaiId: string;
  lokasiId: string;
  lokasiName: string;
  petakNomor: string;
  jalur: JalurManual;
  status: StatusPermohonan;
  nama: string;
  nomorTelepon: string;
  catatan: string | null;
  berkas: { kunci: string; label: string; diunggahPada: Date }[];
  /** What the Admin Lokasi asked to fix (Perlu Perbaikan) or why it was rejected (Ditolak). */
  alasan: string | null;
  diajukanPada: Date;
  tenggatPada: Date | null;
  keputusanPada: Date | null;
  berlakuSampai: Date | null;
  /** True while an approval can still be turned into a Tagihan: Disetujui, inside its 30 days, not yet paid. */
  dapatDipesan: boolean;
  /** Where an approval stands: valid, past its 30 days, or spent by a paid Perpanjangan; null while there is no approval. */
  masaPersetujuan: "berlaku" | "kedaluwarsa" | "terpakai" | null;
}

/** A request for the Admin Lokasi, with a short-lived link to each document. */
export interface PermohonanUntukStaf extends Omit<PermohonanTercatat, "berkas"> {
  berkas: { kunci: string; label: string; diunggahPada: Date; url: string | null }[];
  /** What the Hak Pakai looks like now, so the reviewer sees what an approval changes. */
  hakPakai: { endDate: string | null; perluVerifikasi: boolean; adaPemegang: boolean; pemegangNama: string | null } | null;
}

/** One open "Periksa dokumen Perpanjangan" row of the Antrean Lokasi. */
export interface PeriksaDokumenRow {
  id: string;
  jalur: JalurManual;
  petakNomor: string;
  nama: string;
  tenggatPada: Date | null;
}

export type PermohonanRefusal =
  | { ok: false; reason: "input_tidak_valid" | "permohonan_tidak_ditemukan" | "bukan_pemohon" }
  | { ok: false; reason: "tidak_boleh"; catatan: CatatanPerpanjangan }
  /** The path does not fit the Hak Pakai: a claim needs no holder on record; a KTP or an heir needs one. */
  | { ok: false; reason: "jalur_tidak_sesuai" }
  | { ok: false; reason: "berkas_kurang"; kunci: string }
  | { ok: false; reason: "berkas_tidak_didukung"; kunci: string }
  | { ok: false; reason: "penyimpanan_belum_tersedia" }
  | { ok: false; reason: "nomor_telepon_tidak_valid" }
  /** Another request of this Hak Pakai is still being checked. */
  | { ok: false; reason: "permohonan_terbuka" }
  /** An approval of this Hak Pakai is still valid: order on it instead of filing again. */
  | { ok: false; reason: "sudah_disetujui"; permohonanId: string }
  /** Only a request that Perlu Perbaikan can be corrected. */
  | { ok: false; reason: "bukan_perlu_perbaikan" }
  /** A decision was already made (or the applicant withdrew it). */
  | { ok: false; reason: "sudah_diputuskan" };

export type AjukanPermohonanResult = { ok: true; permohonanId: string } | PermohonanRefusal;
export type UbahPermohonanResult = { ok: true } | PermohonanRefusal;
