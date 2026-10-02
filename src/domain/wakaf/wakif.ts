/**
 * What a Wakif does and sees after filing (spec, Wakaf; stories 109, 112, 113, 114): cancel until
 * Menunggu Ikrar, add documents later, and read their own Pengajuan for the Wakaf tab. These reads
 * select the `wakif` notes by name and never the survey Tugas, so an internal note or the Survei
 * Wakaf report cannot reach a Wakif by forgetting a filter.
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { hapusBerkasWakaf, simpanBerkasWakaf } from "./berkas";
import type { WakafDeps } from "./deps";
import type { Wakif } from "./ajukan";
import { catatPerubahanStatus } from "./riwayat";
import { wakafCatatan, wakafPengajuan, wakafRiwayat, type StatusWakaf, type TujuanWakaf } from "./schema";
import { batalkanWakafSchema, statusAkhir, statusBisaDibatalkan, tambahBerkasWakafSchema } from "./skema";

export interface PengajuanWakafSaya {
  id: string;
  nomor: string;
  status: StatusWakaf;
  tujuan: TujuanWakaf;
  namaKeluarga: string | null;
  kabKota: string;
  alamat: string;
  luasM2: number;
  nazhirNama: string | null;
  /** Dirujuk and Ditolak: the reason, or the pointer to the local KUA/BWI. */
  alasan: string | null;
  tanggalSurvei: string | null;
  tanggalIkrar: string | null;
  diajukanPada: Date;
  riwayat: { status: StatusWakaf; pada: Date; tanggal: string | null }[];
  /** The notes Admin Platform wrote to this Wakif, oldest first. */
  catatan: { id: string; isi: string; pada: Date }[];
  /** The Wakif's own uploads and the final AIW / certificate scan (`kunci` "hasil"). */
  berkas: { id: string; kunci: string; oleh: "wakif" | "staf"; diunggahPada: string }[];
  /** Whether the Wakif may still cancel (until Menunggu Ikrar). */
  bisaDibatalkan: boolean;
}

export type UbahPengajuanWakifResult =
  | { ok: true }
  | { ok: false; reason: "input_tidak_valid" | "pengajuan_tidak_ditemukan" | "tidak_dapat_dibatalkan" | "pengajuan_sudah_ditutup" | "berkas_tidak_didukung" | "penyimpanan_belum_tersedia" };

export type BerkasUrlResult = { ok: true; url: string } | { ok: false; reason: "pengajuan_tidak_ditemukan" | "berkas_tidak_ditemukan" };

const SIGNED_URL_DETIK = 300;

export async function pengajuanSaya(deps: WakafDeps, wakif: Wakif): Promise<PengajuanWakafSaya[]> {
  const rows = await deps.db.select().from(wakafPengajuan).where(eq(wakafPengajuan.wakifAccountId, wakif.accountId)).orderBy(desc(wakafPengajuan.diajukanPada));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const riwayat = await deps.db
    .select({ pengajuanId: wakafRiwayat.pengajuanId, status: wakafRiwayat.status, pada: wakafRiwayat.pada, tanggal: wakafRiwayat.tanggal })
    .from(wakafRiwayat)
    .where(inArray(wakafRiwayat.pengajuanId, ids))
    .orderBy(asc(wakafRiwayat.pada));
  // Only the notes written to the Wakif: the `internal` kind is never selected here.
  const catatan = await deps.db
    .select({ id: wakafCatatan.id, pengajuanId: wakafCatatan.pengajuanId, isi: wakafCatatan.isi, pada: wakafCatatan.pada })
    .from(wakafCatatan)
    .where(and(inArray(wakafCatatan.pengajuanId, ids), eq(wakafCatatan.jenis, "wakif")))
    .orderBy(asc(wakafCatatan.pada));
  return rows.map((row) => ({
    id: row.id,
    nomor: row.nomor,
    status: row.status,
    tujuan: row.tujuan,
    namaKeluarga: row.namaKeluarga,
    kabKota: row.kabKota,
    alamat: row.alamat,
    luasM2: row.luasM2,
    nazhirNama: row.nazhirNama,
    alasan: row.alasan,
    tanggalSurvei: row.tanggalSurvei,
    tanggalIkrar: row.tanggalIkrar,
    diajukanPada: row.diajukanPada,
    riwayat: riwayat.filter((satu) => satu.pengajuanId === row.id).map(({ status, pada, tanggal }) => ({ status, pada, tanggal })),
    catatan: catatan.filter((satu) => satu.pengajuanId === row.id).map(({ id, isi, pada }) => ({ id, isi, pada })),
    berkas: row.berkas.map(({ id, kunci, oleh, diunggahPada }) => ({ id, kunci, oleh, diunggahPada })),
    bisaDibatalkan: statusBisaDibatalkan.includes(row.status),
  }));
}

/** The Wakif withdraws a Pengajuan before Menunggu Ikrar; told by email. */
export async function batalkanWakaf(deps: WakafDeps, wakif: Wakif, raw: unknown): Promise<UbahPengajuanWakifResult> {
  const parsed = batalkanWakafSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();
  return deps.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(wakafPengajuan)
      .where(and(eq(wakafPengajuan.id, parsed.data.pengajuanId), eq(wakafPengajuan.wakifAccountId, wakif.accountId)))
      .for("update");
    if (!row) return { ok: false as const, reason: "pengajuan_tidak_ditemukan" as const };
    if (!statusBisaDibatalkan.includes(row.status)) return { ok: false as const, reason: "tidak_dapat_dibatalkan" as const };
    await tx.update(wakafPengajuan).set({ status: "dibatalkan", tenggatPada: null, diubahPada: now }).where(eq(wakafPengajuan.id, row.id));
    if (parsed.data.alasan) {
      await tx.insert(wakafCatatan).values({ pengajuanId: row.id, jenis: "pembatalan", isi: `Dibatalkan oleh Wakif: ${parsed.data.alasan}`, penulisAccountId: wakif.accountId, pada: now });
    }
    await catatPerubahanStatus(deps, tx, { id: row.id, nomor: row.nomor, wakifEmail: row.wakifEmail }, "dibatalkan", { tanggal: null, alasan: null, catatan: null }, now);
    return { ok: true as const };
  });
}

/** Optional documents, addable later, while the Pengajuan is still open. */
export async function tambahBerkasWakaf(deps: WakafDeps, wakif: Wakif, raw: unknown): Promise<UbahPengajuanWakifResult> {
  const parsed = tambahBerkasWakafSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const [awal] = await deps.db
    .select({ status: wakafPengajuan.status })
    .from(wakafPengajuan)
    .where(and(eq(wakafPengajuan.id, parsed.data.pengajuanId), eq(wakafPengajuan.wakifAccountId, wakif.accountId)));
  if (!awal) return { ok: false, reason: "pengajuan_tidak_ditemukan" };
  if (statusAkhir.includes(awal.status)) return { ok: false, reason: "pengajuan_sudah_ditutup" };
  const now = deps.clock.now();
  const disimpan = await simpanBerkasWakaf(deps, parsed.data.pengajuanId, parsed.data.berkas, "wakif", now);
  if (!disimpan.ok) return disimpan;
  try {
    return await deps.db.transaction(async (tx) => {
      const [row] = await tx.select().from(wakafPengajuan).where(eq(wakafPengajuan.id, parsed.data.pengajuanId)).for("update");
      if (!row || statusAkhir.includes(row.status)) {
        await hapusBerkasWakaf(deps, disimpan.berkas);
        return { ok: false as const, reason: "pengajuan_sudah_ditutup" as const };
      }
      await tx.update(wakafPengajuan).set({ berkas: [...row.berkas, ...disimpan.berkas], diubahPada: now }).where(eq(wakafPengajuan.id, row.id));
      return { ok: true as const };
    });
  } catch (error) {
    await hapusBerkasWakaf(deps, disimpan.berkas);
    throw error;
  }
}

/** A short-lived link to one of the Wakif's own documents, or to the final scan on their own Pengajuan. */
export async function berkasUrlWakif(deps: WakafDeps, wakif: Wakif, pengajuanId: string, berkasId: string): Promise<BerkasUrlResult> {
  if (!/^[0-9a-f-]{36}$/i.test(pengajuanId)) return { ok: false, reason: "pengajuan_tidak_ditemukan" };
  const [row] = await deps.db
    .select({ berkas: wakafPengajuan.berkas })
    .from(wakafPengajuan)
    .where(and(eq(wakafPengajuan.id, pengajuanId), eq(wakafPengajuan.wakifAccountId, wakif.accountId)));
  if (!row) return { ok: false, reason: "pengajuan_tidak_ditemukan" };
  const berkas = row.berkas.find((satu) => satu.id === berkasId);
  if (!berkas) return { ok: false, reason: "berkas_tidak_ditemukan" };
  return { ok: true, url: await deps.files.signedUrl(berkas.fileKey, { expiresInSeconds: SIGNED_URL_DETIK }) };
}

export { SIGNED_URL_DETIK };
