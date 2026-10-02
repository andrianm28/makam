/**
 * Admin Platform's side of a Pengajuan Wakaf (spec, Wakaf; story 166): the manual statuses, the
 * Survei Wakaf Tugas Lapangan, and what Admin Platform reads. Every write is audited and re-checks
 * `wakaf.kelola` itself; nobody else sees a Pengajuan from here.
 */
import { and, asc, desc, eq } from "drizzle-orm";
import { wakafResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { hapusBerkasWakaf, simpanBerkasWakaf } from "./berkas";
import type { WakafDeps } from "./deps";
import { catatPerubahanStatus } from "./riwayat";
import { wakafCatatan, wakafPengajuan, wakafRiwayat, type BerkasWakaf, type JenisCatatanWakaf, type StatusWakaf, type TujuanWakaf } from "./schema";
import { pindahStatusSchema, statusAkhir, transisiStaf } from "./skema";

export interface RiwayatWakaf {
  status: StatusWakaf;
  pada: Date;
  tanggal: string | null;
}

export interface CatatanWakaf {
  id: string;
  jenis: JenisCatatanWakaf;
  isi: string;
  pada: Date;
}

/** One line of Admin Platform's list of Pengajuan Wakaf. */
export interface RingkasanPengajuanWakaf {
  id: string;
  nomor: string;
  status: StatusWakaf;
  wakifNama: string;
  kabKota: string;
  tujuan: TujuanWakaf;
  diajukanPada: Date;
}

/** A Pengajuan as Admin Platform reads it: everything, internal notes included. */
export interface PengajuanWakafStaf extends RingkasanPengajuanWakaf {
  wakifEmail: string;
  wakifTelepon: string;
  hubunganDenganTanah: string;
  namaKeluarga: string | null;
  alamat: string;
  pin: { lat: number; lng: number } | null;
  luasM2: number;
  jenisBukti: string;
  nazhirId: string | null;
  nazhirNama: string | null;
  alasan: string | null;
  tanggalSurvei: string | null;
  tanggalIkrar: string | null;
  /** The Survei Wakaf Tugas Lapangan, whose report only Admin Platform reads (through Field Work). */
  tugasSurveiId: string | null;
  tenggatPada: Date | null;
  riwayat: RiwayatWakaf[];
  catatan: CatatanWakaf[];
  berkas: BerkasWakaf[];
}

export type PengajuanStafResult = { ok: true; pengajuan: PengajuanWakafStaf } | WriteRefusal | { ok: false; reason: "pengajuan_tidak_ditemukan" | "input_tidak_valid" };

export type PindahStatusResult =
  | { ok: true }
  | WriteRefusal
  | {
      ok: false;
      reason:
        | "input_tidak_valid"
        | "pengajuan_tidak_ditemukan"
        | "transisi_tidak_valid"
        | "tanggal_wajib"
        | "petugas_wajib"
        | "petugas_tidak_valid"
        | "alasan_wajib"
        | "hasil_wajib"
        | "berkas_tidak_didukung"
        | "penyimpanan_belum_tersedia";
    };

export async function semuaPengajuan(deps: WakafDeps, by: Actor): Promise<RingkasanPengajuanWakaf[]> {
  if (writeRefusal(by, "wakaf.kelola", wakafResource())) return [];
  return deps.db
    .select({
      id: wakafPengajuan.id,
      nomor: wakafPengajuan.nomor,
      status: wakafPengajuan.status,
      wakifNama: wakafPengajuan.wakifNama,
      kabKota: wakafPengajuan.kabKota,
      tujuan: wakafPengajuan.tujuan,
      diajukanPada: wakafPengajuan.diajukanPada,
    })
    .from(wakafPengajuan)
    .orderBy(desc(wakafPengajuan.diajukanPada));
}

export async function pengajuanStaf(deps: WakafDeps, by: Actor, id: string): Promise<PengajuanStafResult> {
  const refusal = writeRefusal(by, "wakaf.kelola", wakafResource());
  if (refusal) return refusal;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, reason: "pengajuan_tidak_ditemukan" };
  const [row] = await deps.db.select().from(wakafPengajuan).where(eq(wakafPengajuan.id, id));
  if (!row) return { ok: false, reason: "pengajuan_tidak_ditemukan" };
  const riwayat = await deps.db
    .select({ status: wakafRiwayat.status, pada: wakafRiwayat.pada, tanggal: wakafRiwayat.tanggal })
    .from(wakafRiwayat)
    .where(eq(wakafRiwayat.pengajuanId, id))
    .orderBy(asc(wakafRiwayat.pada));
  const catatan = await deps.db
    .select({ id: wakafCatatan.id, jenis: wakafCatatan.jenis, isi: wakafCatatan.isi, pada: wakafCatatan.pada })
    .from(wakafCatatan)
    .where(eq(wakafCatatan.pengajuanId, id))
    .orderBy(asc(wakafCatatan.pada));
  return {
    ok: true,
    pengajuan: {
      id: row.id,
      nomor: row.nomor,
      status: row.status,
      wakifNama: row.wakifNama,
      kabKota: row.kabKota,
      tujuan: row.tujuan,
      diajukanPada: row.diajukanPada,
      wakifEmail: row.wakifEmail,
      wakifTelepon: row.wakifTelepon,
      hubunganDenganTanah: row.hubunganDenganTanah,
      namaKeluarga: row.namaKeluarga,
      alamat: row.alamat,
      pin: row.pinLat !== null && row.pinLng !== null ? { lat: row.pinLat, lng: row.pinLng } : null,
      luasM2: row.luasM2,
      jenisBukti: row.jenisBukti,
      nazhirId: row.nazhirId,
      nazhirNama: row.nazhirNama,
      alasan: row.alasan,
      tanggalSurvei: row.tanggalSurvei,
      tanggalIkrar: row.tanggalIkrar,
      tugasSurveiId: row.tugasSurveiId,
      tenggatPada: row.tenggatPada,
      riwayat,
      catatan,
      berkas: row.berkas,
    },
  };
}

/**
 * Admin Platform moves a Pengajuan to its next status by hand. Survei Dijadwalkan needs the survey's
 * date and a Petugas Lapangan, and schedules the Survei Wakaf Tugas Lapangan in the same transaction;
 * Menunggu Ikrar needs the KUA's date; Ditolak and Dirujuk need a reason; Selesai needs the AIW or
 * certificate scan. An optional note to the Wakif goes with the change. Told to the Wakif by email;
 * audited (the Entri Audit holds the statuses, never a note or a document).
 */
export async function pindahStatus(deps: WakafDeps, by: Actor, raw: unknown): Promise<PindahStatusResult> {
  const refusal = writeRefusal(by, "wakaf.kelola", wakafResource());
  if (refusal) return refusal;
  const parsed = pindahStatusSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const input = parsed.data;
  const now = deps.clock.now();
  let tersimpan: BerkasWakaf[] = [];

  try {
    return await deps.audit.staffWrite(deps.db, async (tx, record) => {
      const [row] = await tx.select().from(wakafPengajuan).where(eq(wakafPengajuan.id, input.pengajuanId)).for("update");
      if (!row) return { ok: false as const, reason: "pengajuan_tidak_ditemukan" as const };
      if (statusAkhir.includes(row.status) || !transisiStaf[row.status].includes(input.status)) {
        return { ok: false as const, reason: "transisi_tidak_valid" as const };
      }
      const tanggal = input.status === "survei_dijadwalkan" || input.status === "menunggu_ikrar" ? (input.tanggal ?? null) : null;
      if ((input.status === "survei_dijadwalkan" || input.status === "menunggu_ikrar") && !tanggal) return { ok: false as const, reason: "tanggal_wajib" as const };
      if (input.status === "survei_dijadwalkan" && !input.petugasAccountId) return { ok: false as const, reason: "petugas_wajib" as const };
      if ((input.status === "ditolak" || input.status === "dirujuk") && !input.alasan) return { ok: false as const, reason: "alasan_wajib" as const };
      if (input.status === "selesai" && (!input.hasil || input.hasil.body.byteLength === 0)) return { ok: false as const, reason: "hasil_wajib" as const };

      let tugasSurveiId = row.tugasSurveiId;
      if (input.status === "survei_dijadwalkan") {
        const tugas = await deps.fieldwork.within(tx).createTugasLapangan(by, {
          type: "survei_wakaf",
          subject: `Survei Wakaf ${row.nomor}`,
          lokasiId: null,
          address: row.alamat,
          pin: row.pinLat !== null && row.pinLng !== null ? { lat: row.pinLat, lng: row.pinLng } : null,
          plannedDate: tanggal!,
          assigneeAccountId: input.petugasAccountId!,
        });
        if (!tugas.ok) return { ok: false as const, reason: "petugas_tidak_valid" as const };
        tugasSurveiId = tugas.tugasLapangan.id;
      }

      let berkas = row.berkas;
      if (input.status === "selesai") {
        const disimpan = await simpanBerkasWakaf(deps, row.id, [input.hasil!], "staf", now, "hasil");
        if (!disimpan.ok) return { ok: false as const, reason: disimpan.reason };
        tersimpan = disimpan.berkas;
        berkas = [...berkas, ...disimpan.berkas];
      }

      await tx
        .update(wakafPengajuan)
        .set({
          status: input.status,
          alasan: input.status === "ditolak" || input.status === "dirujuk" ? input.alasan! : row.alasan,
          tanggalSurvei: input.status === "survei_dijadwalkan" ? tanggal : row.tanggalSurvei,
          tanggalIkrar: input.status === "menunggu_ikrar" ? tanggal : row.tanggalIkrar,
          tugasSurveiId,
          berkas,
          // The first contact has happened: the Tier 3 row closes.
          tenggatPada: null,
          diubahPada: now,
        })
        .where(and(eq(wakafPengajuan.id, row.id), eq(wakafPengajuan.status, row.status)));
      if (input.catatanWakif) {
        await tx.insert(wakafCatatan).values({ pengajuanId: row.id, jenis: "wakif", isi: input.catatanWakif, penulisAccountId: by.accountId, pada: now });
      }
      await catatPerubahanStatus(
        deps,
        tx,
        { id: row.id, nomor: row.nomor, wakifEmail: row.wakifEmail },
        input.status,
        { tanggal, alasan: input.status === "ditolak" || input.status === "dirujuk" ? input.alasan! : null, catatan: input.catatanWakif ?? null },
        now,
      );
      await record({
        actor: { accountId: by.accountId, role: "admin_platform" },
        action: "wakaf.pindah_status",
        entity: { kind: "pengajuan_wakaf", id: row.id },
        before: { status: row.status },
        after: { status: input.status, tanggal },
        reason: null,
      });
      return { ok: true as const };
    }).then(async (hasil) => {
      if (!hasil.ok) await hapusBerkasWakaf(deps, tersimpan);
      return hasil;
    });
  } catch (error) {
    await hapusBerkasWakaf(deps, tersimpan);
    throw error;
  }
}

export interface PengajuanTerbuka {
  id: string;
  nomor: string;
  wakifNama: string;
  kabKota: string;
  diajukanPada: Date;
  /** First contact is due by this time: 3 working days after filing. */
  tenggatPada: Date | null;
}

/** Every Pengajuan still Diajukan, oldest first: the Tier 3 Antrean row reads this (no actor, it raises no alert). */
export async function pengajuanTerbuka(deps: WakafDeps): Promise<PengajuanTerbuka[]> {
  return deps.db
    .select({
      id: wakafPengajuan.id,
      nomor: wakafPengajuan.nomor,
      wakifNama: wakafPengajuan.wakifNama,
      kabKota: wakafPengajuan.kabKota,
      diajukanPada: wakafPengajuan.diajukanPada,
      tenggatPada: wakafPengajuan.tenggatPada,
    })
    .from(wakafPengajuan)
    .where(eq(wakafPengajuan.status, "diajukan"))
    .orderBy(asc(wakafPengajuan.diajukanPada));
}
