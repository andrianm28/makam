/**
 * What a manual request looks like to its applicant, to the Antrean Lokasi and to the Admin Lokasi
 * who reviews it (ticket 41): reads only.
 */
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor } from "@/domain/identity";
import type { Pemohon } from "./ajukan";
import type { PerpanjanganDeps } from "./deps";
import { berkasDari } from "./permohonan-berkas";
import { berkasUntukJalur, BERKAS_PERMOHONAN_URL_SECONDS, type PeriksaDokumenRow, type PermohonanTercatat, type PermohonanUntukStaf } from "./permohonan-skema";
import { perpanjangan, perpanjanganPermohonan } from "./schema";

/** The Perpanjangan of this request that has been paid, if any: an approval is spent once its Perpanjangan is Lunas. */
export async function sudahDibayar(deps: PerpanjanganDeps, permohonanId: string): Promise<boolean> {
  const rows = await deps.db
    .select({ id: perpanjangan.id })
    .from(perpanjangan)
    .where(and(eq(perpanjangan.permohonanId, permohonanId), isNotNull(perpanjangan.dibayarPada)))
    .limit(1);
  return rows.length > 0;
}

async function tercatatDari(deps: PerpanjanganDeps, row: typeof perpanjanganPermohonan.$inferSelect): Promise<PermohonanTercatat> {
  const labels = new Map(berkasUntukJalur(row.jalur).map((satu) => [satu.kunci, satu.label]));
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
    berkas: berkasDari(row).map((satu) => ({ kunci: satu.kunci, label: labels.get(satu.kunci) ?? satu.kunci, diunggahPada: new Date(satu.diunggahPada) })),
    alasan: row.alasan,
    diajukanPada: row.diajukanPada,
    tenggatPada: row.tenggatPada,
    keputusanPada: row.keputusanPada,
    berlakuSampai: row.berlakuSampai,
    dapatDipesan: masaPersetujuan === "berlaku",
    masaPersetujuan,
  };
}

/** One request of the applicant's own, or null. */
export async function milikPemohon(deps: PerpanjanganDeps, pemohon: Pemohon, permohonanId: string) {
  const [row] = await deps.db.select().from(perpanjanganPermohonan).where(eq(perpanjanganPermohonan.id, permohonanId));
  if (!row || row.pemohonAccountId !== pemohon.accountId) return null;
  return row;
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
    berkasDari(row).map(async (satu, index) => {
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
