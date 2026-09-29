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
 *
 * This file is the applicant's side (file, correct, withdraw, order). Its seams:
 * `permohonan-skema` (kinds, schemas, shapes), `permohonan-berkas` (uploads),
 * `permohonan-aturan` (who may file and when), `permohonan-baca` (reads) and
 * `permohonan-keputusan` (the Admin Lokasi's decisions), all re-exported here.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { normalisePhoneNumber } from "@/domain/identity";
import { fakta, labelPetak, pesanTagihan, type AjukanResult, type Pemohon } from "./ajukan";
import type { PerpanjanganDeps } from "./deps";
import { akunDari, faktaManual, jalurTersedia, tenggatOf } from "./permohonan-aturan";
import { berkasDari, berkasKurang, hapusBerkas, simpanBerkas } from "./permohonan-berkas";
import { milikPemohon, sudahDibayar } from "./permohonan-baca";
import {
  ajukanPermohonanSchema,
  batalkanPermohonanSchema,
  perbaikiPermohonanSchema,
  pesanDariPermohonanSchema,
  type AjukanPermohonanResult,
  type UbahPermohonanResult,
} from "./permohonan-skema";
import { perpanjanganPermohonan, type StatusPermohonan } from "./schema";

export * from "./permohonan-skema";
export * from "./permohonan-aturan";
export * from "./permohonan-baca";
export * from "./permohonan-keputusan";
export { berkasKurang, berkasPermohonanSchema } from "./permohonan-berkas";

const BUKA: readonly StatusPermohonan[] = ["diajukan", "perlu_perbaikan"];

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
  if (kurang) {
    await hapusBerkas(deps, disimpan.berkas);
    return { ok: false, reason: "berkas_kurang", kunci: kurang };
  }

  try {
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
  } catch (error) {
    // The request was not written, so the documents stored for it belong to nothing: take them out again.
    await hapusBerkas(deps, disimpan.berkas);
    throw error;
  }
  return { ok: true, permohonanId: id };
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
  const lama = berkasDari(row);
  const berkas = [...lama.filter((satu) => !diganti.has(satu.kunci)), ...baru.berkas];
  const kurang = berkasKurang(row.jalur, berkas);
  if (kurang) {
    await hapusBerkas(deps, baru.berkas);
    return { ok: false, reason: "berkas_kurang", kunci: kurang };
  }
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
    .returning({ id: perpanjanganPermohonan.id })
    .catch(async (error: unknown) => {
      await hapusBerkas(deps, baru.berkas);
      throw error;
    });
  if (diubah.length === 0) {
    await hapusBerkas(deps, baru.berkas);
    return { ok: false, reason: "bukan_perlu_perbaikan" };
  }
  // The documents this correction replaced are no longer on the request.
  await hapusBerkas(deps, lama.filter((satu) => diganti.has(satu.kunci)));
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
