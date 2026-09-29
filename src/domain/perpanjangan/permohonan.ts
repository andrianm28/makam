/**
 * The manual paths into a Perpanjangan (spec, domain module 7; ticket 41): a
 * request with documents that the Admin Lokasi of the Lokasi Mitra checks.
 *
 * - `ktp`: the Pemegang Hak whose Hak Pakai has no recorded email, or who can no
 *   longer use it, uploads a KTP; approval records the applicant's Email
 *   Terverifikasi and phone number on the Hak Pakai.
 * - `ahli_waris`: an heir of a deceased Pemegang Hak files one combined Ganti
 *   Pemegang Hak + Perpanjangan request (death certificate, heirship proof, KTP);
 *   approval records the heir as the new Pemegang Hak, the old one kept in the history.
 * - `klaim`: a relative of an Almarhum with no Pemegang Hak on record claims the
 *   Hak Pakai (KTP, proof of relationship, any old receipt); approval records
 *   the claimant as the Pemegang Hak.
 *
 * A request runs Diajukan -> (Perlu Perbaikan <-> Diajukan) -> Disetujui | Ditolak |
 * Dibatalkan (by the applicant before a decision). While it is Diajukan the Antrean
 * Lokasi shows "Periksa dokumen Perpanjangan", due 2 working days on the Lokasi's
 * Jam Operasional calendar. An approval stays valid 30 days, and in them the
 * applicant chooses the terms and gets the pay-first Tagihan through the very
 * order step of the direct path (`pesanTagihan`), so a lapsed first Tagihan is
 * replaced without uploading again; after 30 days a new review is needed.
 *
 * The documents live only in the private FileStore. Nothing here puts a KTP, a
 * phone number or an email in an audit entry or a log line.
 */
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, normalisePhoneNumber, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { addWorkingDays } from "@/domain/lokasi";
import { documentExtension, type DocumentContentType } from "@/lib/files/document-type";
import { wibDateOf } from "@/lib/time/jakarta";
import { bolehDiperpanjang, type CatatanPerpanjangan } from "./aturan";
import { fakta, labelPetak, pesanTagihan, tidakAdaYangDiperpanjang, type AjukanResult, type Pemohon } from "./ajukan";
import type { PerpanjanganDeps } from "./deps";
import { perpanjangan, perpanjanganPermohonan, jalurManual, type BerkasPermohonan, type JalurManual, type StatusPermohonan } from "./schema";

export { jalurManual, type JalurManual, type StatusPermohonan };

/**
 * A document may be a photo of a paper or a scan of it. The heir path sends three of them in one form and a
 * Server Action's body is capped at 11 MB, so each may be at most 3 MB: three of them always fit.
 */
const BERKAS_TYPES: readonly DocumentContentType[] = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
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

const berkasInputSchema = z.object({
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

async function akunDari(deps: PerpanjanganDeps, pemohon: Pemohon): Promise<boolean> {
  const akun = await deps.identity.accountByEmail(pemohon.email);
  return akun !== null && akun.id === pemohon.accountId;
}

/**
 * Whether a manual request may be filed for this Hak Pakai now: the same blocks as the direct path
 * (perpetual, Berakhir, Dibatalkan, too early, past the Masa Tenggang, an overdue Tagihan), except that
 * a Hak Pakai flagged Perlu Verifikasi is exactly what the Admin Lokasi completes in the review.
 */
async function faktaManual(deps: PerpanjanganDeps, hakPakaiId: string) {
  const tidakDitemukan = { ok: false as const, catatan: { kind: "hubungi_admin_lokasi", sebab: "tidak_ditemukan" } satisfies CatatanPerpanjangan };
  const hak = await deps.inventory.hakPakaiUntukPerpanjangan(hakPakaiId);
  if (!hak) return tidakDitemukan;
  const aturan = await deps.lokasi.aturanPerpanjanganOf(hak.lokasiId);
  if (!aturan) return tidakDitemukan;
  const hariIni = wibDateOf(deps.clock.now());
  // A flagged Hak Pakai with no end date cannot be placed in its window yet: the review supplies the date.
  const tanpaTanggal = hak.perluVerifikasi && hak.endDate === null && hak.tenureYears !== null;
  const boleh = tanpaTanggal ? null : bolehDiperpanjang({ ...hak, perluVerifikasi: false }, hariIni, aturan.masaTenggangMonths);
  if (boleh && !boleh.boleh && tidakAdaYangDiperpanjang(boleh.catatan)) return { ok: false as const, catatan: boleh.catatan };
  if (hak.tenureYears === null) return { ok: false as const, catatan: { kind: "selamanya" } satisfies CatatanPerpanjangan };
  const penghalang = await deps.pemesanan.tagihanPenghalangOf(hak.id);
  if (penghalang) return { ok: false as const, catatan: { kind: "lunasi_tagihan", nomorTagihan: penghalang.nomorTagihan, link: penghalang.link } satisfies CatatanPerpanjangan };
  if (boleh && !boleh.boleh) return { ok: false as const, catatan: boleh.catatan };
  return { ok: true as const, hak, aturan };
}

/** Whether a manual request can be filed for this Hak Pakai now, and by which paths, or the note that replaces the form. */
export type StatusManual =
  | { boleh: true; hakPakaiId: string; lokasiName: string; petakNomor: string; jalurTersedia: JalurManual[] }
  | { boleh: false; catatan: CatatanPerpanjangan };

export async function statusManual(deps: PerpanjanganDeps, hakPakaiId: string): Promise<StatusManual> {
  const dasar = await faktaManual(deps, hakPakaiId);
  if (!dasar.ok) return { boleh: false, catatan: dasar.catatan };
  return { boleh: true, hakPakaiId: dasar.hak.id, lokasiName: dasar.aturan.name, petakNomor: labelPetak(dasar.hak), jalurTersedia: jalurTersedia(dasar.hak) };
}

/** A claim is for a Hak Pakai with no Pemegang Hak on record; a KTP or an heir needs one on record. */
function jalurTersedia(hak: { pemegangHak: { name: string | null } | null }): JalurManual[] {
  return hak.pemegangHak?.name ? ["ktp", "ahli_waris"] : ["klaim"];
}

type BerkasInput = z.infer<typeof berkasInputSchema>;

/** Checks every document of `kunciDiizinkan` that came in (type, content, size) and stores it privately. */
async function simpanBerkas(
  deps: PerpanjanganDeps,
  permohonanId: string,
  jalur: JalurManual,
  masuk: readonly BerkasInput[],
  now: Date,
): Promise<{ ok: true; berkas: BerkasPermohonan[] } | PermohonanRefusal> {
  const dikenal = new Set(BERKAS_JALUR[jalur].map((satu) => satu.kunci));
  const terakhir = new Map<string, BerkasInput>();
  for (const berkas of masuk) {
    if (berkas.body.byteLength === 0) continue;
    if (!dikenal.has(berkas.kunci)) return { ok: false, reason: "input_tidak_valid" };
    terakhir.set(berkas.kunci, berkas);
  }
  const hasil: BerkasPermohonan[] = [];
  for (const [kunci, berkas] of terakhir) {
    const extension = documentExtension(berkas, BERKAS_TYPES);
    if (!extension || berkas.body.byteLength > BERKAS_PERMOHONAN_MAX_BYTES) return { ok: false, reason: "berkas_tidak_didukung", kunci };
  }
  for (const [kunci, berkas] of terakhir) {
    const extension = documentExtension(berkas, BERKAS_TYPES)!;
    const fileKey = `perpanjangan-permohonan/${permohonanId}/${kunci}-${randomUUID()}.${extension}`;
    try {
      await deps.files.put({ key: fileKey, body: berkas.body, contentType: berkas.contentType });
    } catch {
      return { ok: false, reason: "penyimpanan_belum_tersedia" };
    }
    hasil.push({ kunci, fileKey, contentType: berkas.contentType, diunggahPada: now.toISOString() });
  }
  return { ok: true, berkas: hasil };
}

/** The first required document a path still lacks, or null when it has them all. */
function berkasKurang(jalur: JalurManual, ada: readonly BerkasPermohonan[]): string | null {
  const kunci = new Set(ada.map((satu) => satu.kunci));
  return BERKAS_JALUR[jalur].find((satu) => satu.wajib && !kunci.has(satu.kunci))?.kunci ?? null;
}

/** The due instant of a request filed at `now`: 2 working days on the Lokasi's calendar, or null while the calendar is empty. */
async function tenggatOf(deps: PerpanjanganDeps, lokasiId: string, now: Date): Promise<Date | null> {
  const jam = await deps.lokasi.jamOperasionalOf(lokasiId);
  if (!jam.ok) return null;
  const tenggat = addWorkingDays(jam.jamOperasional, now, TENGGAT_PERIKSA_HARI_KERJA);
  return tenggat.ok ? tenggat.at : null;
}

const BUKA: readonly StatusPermohonan[] = ["diajukan", "perlu_perbaikan"];

/** The Perpanjangan of this request that has been paid, if any: an approval is spent once its Perpanjangan is Lunas. */
async function sudahDibayar(deps: PerpanjanganDeps, permohonanId: string): Promise<boolean> {
  const rows = await deps.db
    .select({ id: perpanjangan.id })
    .from(perpanjangan)
    .where(and(eq(perpanjangan.permohonanId, permohonanId), isNotNull(perpanjangan.dibayarPada)))
    .limit(1);
  return rows.length > 0;
}

async function tercatatDari(deps: PerpanjanganDeps, row: typeof perpanjanganPermohonan.$inferSelect): Promise<PermohonanTercatat> {
  const labels = new Map(BERKAS_JALUR[row.jalur].map((satu) => [satu.kunci, satu.label]));
  const now = deps.clock.now();
  const disetujui = row.status === "disetujui" && row.berlakuSampai !== null;
  const terpakai = disetujui && (await sudahDibayar(deps, row.id));
  const masaPersetujuan = !disetujui ? null : terpakai ? "terpakai" : row.berlakuSampai! >= now ? "berlaku" : "kedaluwarsa";
  return {
    id: row.id,
    hakPakaiId: row.hakPakaiId,
    lokasiId: row.lokasiId,
    lokasiName: row.lokasiName,
    petakNomor: row.petakNomor,
    jalur: row.jalur,
    status: row.status,
    nama: row.nama,
    nomorTelepon: row.nomorTelepon,
    catatan: row.catatan,
    berkas: row.berkas.map((satu) => ({ kunci: satu.kunci, label: labels.get(satu.kunci) ?? satu.kunci, diunggahPada: new Date(satu.diunggahPada) })),
    alasan: row.alasan,
    diajukanPada: row.diajukanPada,
    tenggatPada: row.tenggatPada,
    keputusanPada: row.keputusanPada,
    berlakuSampai: row.berlakuSampai,
    dapatDipesan: masaPersetujuan === "berlaku",
    masaPersetujuan,
  };
}

/** Files a manual request: the documents go to the private FileStore and the request is Diajukan, due in 2 working days. */
export async function ajukanPermohonan(deps: PerpanjanganDeps, pemohon: Pemohon, rawInput: unknown): Promise<AjukanPermohonanResult> {
  const parsed = ajukanPermohonanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  if (!(await akunDari(deps, pemohon))) return { ok: false, reason: "bukan_pemohon" };
  const phone = normalisePhoneNumber(input.nomorTelepon);
  if (!phone.ok) return { ok: false, reason: "nomor_telepon_tidak_valid" };

  const dasar = await faktaManual(deps, input.hakPakaiId);
  if (!dasar.ok) return { ok: false, reason: "tidak_boleh", catatan: dasar.catatan };
  const { hak } = dasar;
  if (!jalurTersedia(hak).includes(input.jalur)) return { ok: false, reason: "jalur_tidak_sesuai" };

  const lain = await deps.db
    .select({ id: perpanjanganPermohonan.id, status: perpanjanganPermohonan.status, berlakuSampai: perpanjanganPermohonan.berlakuSampai })
    .from(perpanjanganPermohonan)
    .where(and(eq(perpanjanganPermohonan.hakPakaiId, hak.id), inArray(perpanjanganPermohonan.status, ["diajukan", "perlu_perbaikan", "disetujui"])));
  const now = deps.clock.now();
  if (lain.some((satu) => BUKA.includes(satu.status))) return { ok: false, reason: "permohonan_terbuka" };
  for (const satu of lain) {
    if (satu.berlakuSampai && satu.berlakuSampai >= now && !(await sudahDibayar(deps, satu.id))) return { ok: false, reason: "sudah_disetujui", permohonanId: satu.id };
  }

  const id = randomUUID();
  const disimpan = await simpanBerkas(deps, id, input.jalur, input.berkas, now);
  if (!disimpan.ok) return disimpan;
  const kurang = berkasKurang(input.jalur, disimpan.berkas);
  if (kurang) return { ok: false, reason: "berkas_kurang", kunci: kurang };

  await deps.db.insert(perpanjanganPermohonan).values({
    id,
    hakPakaiId: hak.id,
    lokasiId: hak.lokasiId,
    lokasiName: dasar.aturan.name,
    petakNomor: labelPetak(hak),
    jalur: input.jalur,
    status: "diajukan",
    pemohonAccountId: pemohon.accountId,
    email: pemohon.email,
    nama: input.nama,
    nomorTelepon: phone.phoneNumber,
    catatan: input.catatan || null,
    berkas: disimpan.berkas,
    diajukanPada: now,
    tenggatPada: await tenggatOf(deps, hak.lokasiId, now),
    dibuatPada: now,
  });
  return { ok: true, permohonanId: id };
}

/** One request of the applicant's own, locked for a change; the reason it cannot be changed otherwise. */
async function milikPemohon(deps: PerpanjanganDeps, pemohon: Pemohon, permohonanId: string) {
  const [row] = await deps.db.select().from(perpanjanganPermohonan).where(eq(perpanjanganPermohonan.id, permohonanId));
  if (!row || row.pemohonAccountId !== pemohon.accountId) return null;
  return row;
}

/** The applicant corrects a request the Admin Lokasi sent back (Perlu Perbaikan -> Diajukan, due 2 working days from now again). */
export async function perbaikiPermohonan(deps: PerpanjanganDeps, pemohon: Pemohon, rawInput: unknown): Promise<UbahPermohonanResult> {
  const parsed = perbaikiPermohonanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const row = await milikPemohon(deps, pemohon, input.permohonanId);
  if (!row) return { ok: false, reason: "permohonan_tidak_ditemukan" };
  if (row.status !== "perlu_perbaikan") return { ok: false, reason: "bukan_perlu_perbaikan" };
  let telepon = row.nomorTelepon;
  if (input.nomorTelepon) {
    const phone = normalisePhoneNumber(input.nomorTelepon);
    if (!phone.ok) return { ok: false, reason: "nomor_telepon_tidak_valid" };
    telepon = phone.phoneNumber;
  }
  const now = deps.clock.now();
  const baru = await simpanBerkas(deps, row.id, row.jalur, input.berkas, now);
  if (!baru.ok) return baru;
  const diganti = new Set(baru.berkas.map((satu) => satu.kunci));
  const berkas = [...row.berkas.filter((satu) => !diganti.has(satu.kunci)), ...baru.berkas];
  const kurang = berkasKurang(row.jalur, berkas);
  if (kurang) return { ok: false, reason: "berkas_kurang", kunci: kurang };
  const tenggat = await tenggatOf(deps, row.lokasiId, now);
  const diubah = await deps.db
    .update(perpanjanganPermohonan)
    .set({
      status: "diajukan",
      nama: input.nama ?? row.nama,
      nomorTelepon: telepon,
      catatan: input.catatan === undefined ? row.catatan : input.catatan || null,
      berkas,
      diajukanPada: now,
      tenggatPada: tenggat,
    })
    .where(and(eq(perpanjanganPermohonan.id, row.id), eq(perpanjanganPermohonan.status, "perlu_perbaikan")))
    .returning({ id: perpanjanganPermohonan.id });
  if (diubah.length === 0) return { ok: false, reason: "bukan_perlu_perbaikan" };
  return { ok: true };
}

/** The applicant withdraws a request before any decision (Diajukan or Perlu Perbaikan -> Dibatalkan). */
export async function batalkanPermohonan(deps: PerpanjanganDeps, pemohon: Pemohon, rawInput: unknown): Promise<UbahPermohonanResult> {
  const parsed = batalkanPermohonanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const row = await milikPemohon(deps, pemohon, parsed.data.permohonanId);
  if (!row) return { ok: false, reason: "permohonan_tidak_ditemukan" };
  const diubah = await deps.db
    .update(perpanjanganPermohonan)
    .set({ status: "dibatalkan" })
    .where(and(eq(perpanjanganPermohonan.id, row.id), inArray(perpanjanganPermohonan.status, ["diajukan", "perlu_perbaikan"])))
    .returning({ id: perpanjanganPermohonan.id });
  if (diubah.length === 0) return { ok: false, reason: "sudah_diputuskan" };
  return { ok: true };
}

/** The applicant's own requests, newest first (never anyone else's). */
export async function permohonanSaya(deps: PerpanjanganDeps, pemohon: Pick<Pemohon, "accountId">): Promise<PermohonanTercatat[]> {
  const rows = await deps.db
    .select()
    .from(perpanjanganPermohonan)
    .where(eq(perpanjanganPermohonan.pemohonAccountId, pemohon.accountId))
    .orderBy(desc(perpanjanganPermohonan.dibuatPada));
  return Promise.all(rows.map((row) => tercatatDari(deps, row)));
}

/** One request of the applicant's own, or null for another Akun's or an unknown id. */
export async function permohonanOf(deps: PerpanjanganDeps, pemohon: Pemohon, permohonanId: string): Promise<PermohonanTercatat | null> {
  if (!z.uuid().safeParse(permohonanId).success) return null;
  const row = await milikPemohon(deps, pemohon, permohonanId);
  return row ? tercatatDari(deps, row) : null;
}

export type PesanDariPermohonanResult =
  | AjukanResult
  | { ok: false; reason: "permohonan_tidak_ditemukan" | "belum_disetujui" | "persetujuan_kedaluwarsa" | "sudah_dipakai" | "bukan_pemohon" };

/**
 * Orders the Perpanjangan on an approved request: the same order step as the direct path, with the
 * Tagihan addressed to the Pemegang Hak the approval recorded. Valid for 30 days from the approval and
 * until its Perpanjangan is paid, so a lapsed Tagihan is replaced without uploading again.
 */
export async function pesanDariPermohonan(deps: PerpanjanganDeps, pemohon: Pemohon, rawInput: unknown): Promise<PesanDariPermohonanResult> {
  const parsed = pesanDariPermohonanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const row = await milikPemohon(deps, pemohon, input.permohonanId);
  if (!row) return { ok: false, reason: "permohonan_tidak_ditemukan" };
  if (row.status !== "disetujui" || !row.berlakuSampai) return { ok: false, reason: "belum_disetujui" };
  const now = deps.clock.now();
  if (row.berlakuSampai < now) return { ok: false, reason: "persetujuan_kedaluwarsa" };
  if (await sudahDibayar(deps, row.id)) return { ok: false, reason: "sudah_dipakai" };
  const akun = await deps.identity.accountByEmail(pemohon.email);
  if (!akun || akun.id !== pemohon.accountId) return { ok: false, reason: "bukan_pemohon" };

  // The same blocks as ticket 40 (overdue Tagihan, perpetual, too early, Berakhir, Dibatalkan) apply at the order.
  const dasar = await fakta(deps, row.hakPakaiId);
  if (!dasar.ok) return { ok: false, reason: "tidak_boleh", catatan: dasar.catatan };
  return pesanTagihan(deps, { hak: dasar.hak, aturan: dasar.aturan, akun: { id: akun.id, email: akun.email }, terms: input.terms, now, permohonanId: row.id });
}

/** Every "Periksa dokumen Perpanjangan" row of one Lokasi Mitra: the requests still Diajukan, soonest due first. */
export async function antreanPeriksaDokumen(deps: PerpanjanganDeps, lokasiId: string): Promise<PeriksaDokumenRow[]> {
  const rows = await deps.db
    .select()
    .from(perpanjanganPermohonan)
    .where(and(eq(perpanjanganPermohonan.lokasiId, lokasiId), eq(perpanjanganPermohonan.status, "diajukan")))
    .orderBy(asc(perpanjanganPermohonan.tenggatPada), asc(perpanjanganPermohonan.diajukanPada));
  return rows.map((row) => ({ id: row.id, jalur: row.jalur, petakNomor: row.petakNomor, nama: row.nama, tenggatPada: row.tenggatPada }));
}

/** One request with its documents for that Lokasi's own Admin Lokasi; null for another Lokasi's, an unknown id, or anyone else. */
export async function permohonanUntukStaf(deps: PerpanjanganDeps, by: Actor, permohonanId: string): Promise<PermohonanUntukStaf | null> {
  if (!z.uuid().safeParse(permohonanId).success) return null;
  const [row] = await deps.db.select().from(perpanjanganPermohonan).where(eq(perpanjanganPermohonan.id, permohonanId));
  if (!row) return null;
  if (writeRefusal(by, "perpanjangan.periksa", lokasiMitraResource(row.lokasiId))) return null;
  const tercatat = await tercatatDari(deps, row);
  const berkas = await Promise.all(
    row.berkas.map(async (satu, index) => {
      let url: string | null = null;
      try {
        url = await deps.files.signedUrl(satu.fileKey, { expiresInSeconds: BERKAS_PERMOHONAN_URL_SECONDS });
      } catch {
        url = null;
      }
      return { ...tercatat.berkas[index]!, url };
    }),
  );
  const hak = await deps.inventory.hakPakaiUntukPerpanjangan(row.hakPakaiId);
  return {
    ...tercatat,
    berkas,
    hakPakai: hak
      ? { endDate: hak.endDate, perluVerifikasi: hak.perluVerifikasi, adaPemegang: Boolean(hak.pemegangHak?.name), pemegangNama: hak.pemegangHak?.name ?? null }
      : null,
  };
}

export type KeputusanResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "permohonan_tidak_ditemukan" | "hak_pakai_tidak_ditemukan" | "hak_pakai_sudah_berakhir" }
  /** Only a request that is Diajukan can be decided; a second decision, or one on a withdrawn request, says so. */
  | { ok: false; reason: "tidak_dapat_diputuskan" }
  /** The Hak Pakai is flagged Perlu Verifikasi with no end date on record, and the review gave none. */
  | { ok: false; reason: "tanggal_berakhir_wajib" }
  /** The holder or contact could not be recorded (an invalid number, say); nothing was changed. */
  | { ok: false; reason: "pemegang_hak_gagal"; sebab: string }
  /** The Hak Pakai could not be completed (its Perlu Verifikasi flag); nothing was changed. */
  | { ok: false; reason: "verifikasi_gagal"; sebab: string };

/** The request an Admin Lokasi decides, or the refusal: unknown, another Lokasi's Admin Lokasi, or not Diajukan. */
async function untukDiputuskan(deps: PerpanjanganDeps, by: Actor, permohonanId: string) {
  const [row] = await deps.db.select().from(perpanjanganPermohonan).where(eq(perpanjanganPermohonan.id, permohonanId));
  if (!row) return { ok: false as const, hasil: { ok: false as const, reason: "permohonan_tidak_ditemukan" as const } };
  const refusal = writeRefusal(by, "perpanjangan.periksa", lokasiMitraResource(row.lokasiId));
  if (refusal) return { ok: false as const, hasil: refusal };
  if (row.status !== "diajukan") return { ok: false as const, hasil: { ok: false as const, reason: "tidak_dapat_diputuskan" as const } };
  return { ok: true as const, row };
}

/**
 * Approves a request (Disetujui) after checking its documents: records the holder as the path needs it
 * (a new Pemegang Hak for an heir or a claim, the applicant's email and number for a KTP), completes a
 * Hak Pakai flagged Perlu Verifikasi, and starts the 30 days in which the applicant may order. All of it
 * is one transaction with one Entri Audit per write, so a refusal anywhere changes nothing.
 */
export async function setujuiPermohonan(deps: PerpanjanganDeps, by: Actor, rawInput: unknown): Promise<KeputusanResult> {
  const parsed = setujuiPermohonanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const dimuat = await untukDiputuskan(deps, by, input.permohonanId);
  if (!dimuat.ok) return dimuat.hasil;
  const { row } = dimuat;
  const hak = await deps.inventory.hakPakaiUntukPerpanjangan(row.hakPakaiId);
  if (!hak || hak.lokasiId !== row.lokasiId) return { ok: false, reason: "hak_pakai_tidak_ditemukan" };
  if (hak.status === "berakhir" || hak.status === "dibatalkan") return { ok: false, reason: "hak_pakai_sudah_berakhir" };
  if (hak.perluVerifikasi && hak.tenureYears !== null && hak.endDate === null && !input.endDate) return { ok: false, reason: "tanggal_berakhir_wajib" };

  const now = deps.clock.now();
  const berlakuSampai = new Date(now.getTime() + MASA_BERLAKU_PERSETUJUAN_HARI * 24 * 60 * 60 * 1000);
  const nama = input.nama ?? row.nama;
  const telepon = input.nomorTelepon ?? row.nomorTelepon;
  const sebab = `Permohonan Perpanjangan ${row.id}`;
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [terkunci] = await tx.select().from(perpanjanganPermohonan).where(eq(perpanjanganPermohonan.id, row.id)).for("update");
    if (!terkunci || terkunci.status !== "diajukan") return { ok: false as const, reason: "tidak_dapat_diputuskan" as const };
    const inventory = deps.inventory.within(tx);
    const pemegang =
      row.jalur === "ktp"
        ? await inventory.ubahKontakPemegangHak(by, row.lokasiId, {
            hakPakaiId: row.hakPakaiId,
            name: hak.pemegangHak?.name ? undefined : nama,
            phoneNumber: telepon,
            email: row.email,
            alasan: sebab,
          })
        : await inventory.gantiPemegangHak(by, row.lokasiId, {
            hakPakaiId: row.hakPakaiId,
            pemegangHak: { name: nama, phoneNumber: telepon, email: row.email },
            alasan: sebab,
          });
    if (!pemegang.ok) return { ok: false as const, reason: "pemegang_hak_gagal" as const, sebab: pemegang.reason };
    if (hak.perluVerifikasi) {
      const lengkap = await inventory.lengkapiHakPakai(by, row.lokasiId, { hakPakaiId: row.hakPakaiId, endDate: input.endDate });
      if (!lengkap.ok) return { ok: false as const, reason: "verifikasi_gagal" as const, sebab: lengkap.reason };
    }
    await tx
      .update(perpanjanganPermohonan)
      .set({ status: "disetujui", alasan: null, keputusanPada: now, keputusanOlehAccountId: by.accountId, berlakuSampai })
      .where(eq(perpanjanganPermohonan.id, row.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action: "perpanjangan.setujui",
      entity: { kind: "perpanjangan_permohonan", id: row.id },
      lokasiId: row.lokasiId,
      before: { status: "diajukan" },
      after: { status: "disetujui", jalur: row.jalur, hakPakaiId: row.hakPakaiId, berlakuSampai: berlakuSampai.toISOString(), hakPakaiDilengkapi: hak.perluVerifikasi },
      reason: input.alasan,
    });
    return { ok: true as const };
  });
}

/** Rejects a request (Ditolak) with a reason the applicant reads; nothing about the Hak Pakai changes. */
export function tolakPermohonan(deps: PerpanjanganDeps, by: Actor, rawInput: unknown): Promise<KeputusanResult> {
  return putuskan(deps, by, rawInput, "ditolak", "perpanjangan.tolak");
}

/** Sends a request back (Perlu Perbaikan) with what to fix; the applicant corrects it and it is Diajukan again. */
export function mintaPerbaikanPermohonan(deps: PerpanjanganDeps, by: Actor, rawInput: unknown): Promise<KeputusanResult> {
  return putuskan(deps, by, rawInput, "perlu_perbaikan", "perpanjangan.minta_perbaikan");
}

async function putuskan(
  deps: PerpanjanganDeps,
  by: Actor,
  rawInput: unknown,
  ke: "ditolak" | "perlu_perbaikan",
  action: "perpanjangan.tolak" | "perpanjangan.minta_perbaikan",
): Promise<KeputusanResult> {
  const parsed = putuskanPermohonanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const dimuat = await untukDiputuskan(deps, by, input.permohonanId);
  if (!dimuat.ok) return dimuat.hasil;
  const { row } = dimuat;
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const diubah = await tx
      .update(perpanjanganPermohonan)
      .set({ status: ke, alasan: input.alasan, keputusanPada: ke === "ditolak" ? now : null, keputusanOlehAccountId: by.accountId })
      .where(and(eq(perpanjanganPermohonan.id, row.id), eq(perpanjanganPermohonan.status, "diajukan")))
      .returning({ id: perpanjanganPermohonan.id });
    if (diubah.length === 0) return { ok: false as const, reason: "tidak_dapat_diputuskan" as const };
    await record({
      actor: { accountId: by.accountId, role: "admin_lokasi" },
      action,
      entity: { kind: "perpanjangan_permohonan", id: row.id },
      lokasiId: row.lokasiId,
      before: { status: "diajukan" },
      after: { status: ke, jalur: row.jalur, hakPakaiId: row.hakPakaiId },
      reason: input.alasan,
    });
    return { ok: true as const };
  });
}
