/**
 * A Keluhan on a TPU job (spec, Layanan > Keluhan; stories 94, 158; ticket 57). The Pemesan files it
 * on a Selesai job inside the 3×24 h window that opened when Admin Platform approved the proof; the
 * job becomes Keluhan, which holds the Mitra Jasa's Pencairan (the window-close tick only looks at
 * Selesai jobs). Admin Platform then rejects it (the job is Selesai again and the tick releases the
 * Pencairan once the window is over) or has the job redone by a Mitra Jasa it names (`kerjaUlangDariKeluhanTpu`,
 * whose pay rules then apply). A refund is not offered here.
 */
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { daytimeHoursDeadline } from "@/domain/lokasi";
import type { Actor } from "@/domain/identity";
import { normaliseEmail, pekerjaanTpuSemuaResource, writeRefusal, type WriteRefusal } from "@/domain/identity";
import { buktiTpuPerPekerjaan, type BuktiTpuTerbaca } from "./bukti-tpu-baca";
import { kerjaUlangDariKeluhanTpu } from "./kerja-ulang-tpu";
import { mitraJasaTersedia, type MitraJasaTersedia } from "./penugasan";
import type { LayananDeps, PemesanLayanan } from "./deps";
import { jendelaKeluhanBerakhirAt } from "./keluhan";
import { sesuaikanPencairanKeluhanSchema } from "./pesanan-schema";
import { keluhanLayananTpu, pekerjaanLayananTpu } from "./schema";
import { ajukanKeluhanTpuSchema, putuskanKeluhanTpuSchema } from "./tpu-skema";

export type AjukanKeluhanTpuResult =
  | { ok: true; keluhanId: string }
  | { ok: false; reason: "input_tidak_valid" | "bukan_pemesan" | "tidak_ditemukan" | "belum_selesai" | "jendela_tertutup" | "sudah_ada" };

export async function ajukanKeluhanTpu(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<AjukanKeluhanTpuResult> {
  const parsed = ajukanKeluhanTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, alasan } = parsed.data;
  const email = normaliseEmail(pemesan.email);
  const akun = email === null ? null : await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== pemesan.accountId) return { ok: false, reason: "bukan_pemesan" };
  const now = deps.clock.now();

  return deps.db.transaction(async (tx) => {
    const [job] = await tx.select().from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, pekerjaanId)).for("update");
    // Somebody else's order is "not found", as everywhere a family reads an order.
    if (!job || job.pemesanAccountId !== pemesan.accountId) return { ok: false as const, reason: "tidak_ditemukan" as const };
    const [ada] = await tx.select({ id: keluhanLayananTpu.id }).from(keluhanLayananTpu).where(eq(keluhanLayananTpu.pekerjaanId, pekerjaanId));
    if (ada) return { ok: false as const, reason: "sudah_ada" as const };
    const berakhir = jendelaKeluhanBerakhirAt(job.buktiDitunjukkanAt);
    if (job.status !== "selesai" || !berakhir) return { ok: false as const, reason: "belum_selesai" as const };
    if (now.getTime() > berakhir.getTime()) return { ok: false as const, reason: "jendela_tertutup" as const };
    const [ditulis] = await tx.insert(keluhanLayananTpu).values({ pekerjaanId, alasan, diajukanAt: now }).returning({ id: keluhanLayananTpu.id });
    await tx.update(pekerjaanLayananTpu).set({ status: "keluhan" }).where(eq(pekerjaanLayananTpu.id, pekerjaanId));
    return { ok: true as const, keluhanId: ditulis.id };
  });
}

export type PutuskanKeluhanTpuResult =
  | { ok: true }
  | WriteRefusal
  | { ok: false; reason: "input_tidak_valid" | "tidak_ditemukan" | "sudah_diputuskan" | "mitra_jasa_tidak_tersedia" };

/** A redo that could not be handed over: thrown inside the decision's transaction so that nothing of the decision is kept. */
class KerjaUlangGagal extends Error {
  constructor(readonly reason: "input_tidak_valid" | "mitra_jasa_tidak_tersedia") {
    super(reason);
  }
}

/**
 * Admin Platform decides a Keluhan. One transaction: the claim on the Keluhan, the redo or the job's return
 * to Selesai, and the audit entry stand or fall together, so a redo that cannot be handed over leaves the
 * Keluhan open for Admin Platform to decide differently, and two decisions on it take turns.
 */
export async function putuskanKeluhanTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<PutuskanKeluhanTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = putuskanKeluhanTpuSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { keluhanId, keputusan, catatan, mitraJasaId } = parsed.data;
  if (keputusan === "kerjakan_ulang" && !mitraJasaId) return { ok: false, reason: "input_tidak_valid" };
  const now = deps.clock.now();
  const status = keputusan === "tolak" ? ("ditolak" as const) : ("kerjakan_ulang" as const);

  try {
    return await deps.db.transaction(async (tx): Promise<PutuskanKeluhanTpuResult> => {
      const diklaim = await tx
        .update(keluhanLayananTpu)
        .set({ status, diputuskanAt: now, diputuskanOleh: by.accountId, catatanKeputusan: catatan })
        .where(and(eq(keluhanLayananTpu.id, keluhanId), eq(keluhanLayananTpu.status, "terbuka")))
        .returning({ pekerjaanId: keluhanLayananTpu.pekerjaanId });
      if (diklaim.length === 0) {
        const [ada] = await tx.select({ id: keluhanLayananTpu.id }).from(keluhanLayananTpu).where(eq(keluhanLayananTpu.id, keluhanId));
        return { ok: false, reason: ada ? "sudah_diputuskan" : "tidak_ditemukan" };
      }
      const { pekerjaanId } = diklaim[0];

      if (keputusan === "kerjakan_ulang" && mitraJasaId) {
        const ulang = await kerjaUlangDariKeluhanTpu({ ...deps, db: tx }, by, { pekerjaanId, mitraJasaId });
        if (!ulang.ok) throw new KerjaUlangGagal(ulang.reason === "mitra_jasa_tidak_tersedia" ? "mitra_jasa_tidak_tersedia" : "input_tidak_valid");
      } else {
        await tx.update(pekerjaanLayananTpu).set({ status: "selesai" }).where(and(eq(pekerjaanLayananTpu.id, pekerjaanId), eq(pekerjaanLayananTpu.status, "keluhan")));
      }
      await deps.audit.staffWrite(tx, async (_tx, record) => {
        await record({
          actor: { accountId: by.accountId, role: "admin_platform" },
          action: "layanan.putuskan_keluhan_tpu",
          entity: { kind: "keluhan_layanan_tpu", id: keluhanId },
          lokasiId: null,
          before: { status: "terbuka" },
          after: { status, pekerjaanId },
          reason: catatan,
        });
        return { ok: true as const };
      });
      return { ok: true };
    });
  } catch (error) {
    if (error instanceof KerjaUlangGagal) return { ok: false, reason: error.reason };
    throw error;
  }
}

export type SesuaikanPencairanKeluhanTpuResult =
  | { ok: true; jumlah: number; jumlahAwal: number }
  | WriteRefusal
  | {
      ok: false;
      reason: "input_tidak_valid" | "tidak_ditemukan" | "keluhan_belum_diputuskan" | "pencairan_belum_ada" | "melebihi_tarif" | "sudah_dicairkan";
    };

/**
 * Admin Platform adjusts what the job pays its Mitra Jasa after a Keluhan (e.g. half), with a mandatory note (spec,
 * Layanan > Keluhan outcome; story 158). Allowed once the Keluhan is decided (rejected or redone). The Keluhan is
 * locked, the item is read and Payouts' own audited write is on the same transaction; the ceiling (never above what
 * the Mitra Jasa rate issued) is Payouts' rule.
 */
export async function sesuaikanPencairanKeluhanTpu(deps: LayananDeps, by: Actor, rawInput: unknown): Promise<SesuaikanPencairanKeluhanTpuResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  const parsed = sesuaikanPencairanKeluhanSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { keluhanId, amount, catatan } = parsed.data;
  return deps.db.transaction(async (tx): Promise<SesuaikanPencairanKeluhanTpuResult> => {
    const [keluhan] = await tx.select().from(keluhanLayananTpu).where(eq(keluhanLayananTpu.id, keluhanId)).for("update");
    if (!keluhan) return { ok: false, reason: "tidak_ditemukan" };
    if (keluhan.status === "terbuka") return { ok: false, reason: "keluhan_belum_diputuskan" };
    const [job] = await tx.select({ pencairanItemId: pekerjaanLayananTpu.pencairanItemId }).from(pekerjaanLayananTpu).where(eq(pekerjaanLayananTpu.id, keluhan.pekerjaanId));
    if (!job?.pencairanItemId) return { ok: false, reason: "pencairan_belum_ada" };
    const hasil = await deps.payouts.turunkanJumlahPencairan(by, { itemId: job.pencairanItemId, amount, catatan }, tx);
    if (hasil.ok) return { ok: true, jumlah: hasil.item.amount, jumlahAwal: hasil.item.amountAwal };
    return hasil;
  });
}

export interface KeluhanTpuTerbuka {
  id: string;
  pekerjaanId: string;
  alasan: string;
  diajukanAt: Date;
}

/** Every Keluhan on a TPU job still waiting for Admin Platform, oldest first. */
export async function keluhanTpuTerbuka(deps: Pick<LayananDeps, "db">, by: Actor): Promise<KeluhanTpuTerbuka[]> {
  if (writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource())) return [];
  const rows = await deps.db.select().from(keluhanLayananTpu).where(eq(keluhanLayananTpu.status, "terbuka")).orderBy(asc(keluhanLayananTpu.diajukanAt));
  return rows.map((row) => ({ id: row.id, pekerjaanId: row.pekerjaanId, alasan: row.alasan, diajukanAt: row.diajukanAt }));
}

/** Admin Platform has this long, in daytime hours (06:00-18:00 WIB), to answer a Keluhan first (spec, Work Queues Tier 1). */
export const JAM_RESPON_PERTAMA_KELUHAN_TPU = 4;

export interface KeluhanTpuTerbukaAntrean {
  id: string;
  pekerjaanId: string;
  nomor: string;
  label: string;
  tpuName: string;
  diajukanAt: Date;
  responPertamaDueAt: Date;
}

/** The Keluhan on TPU jobs waiting for a decision, oldest first, each with its first-response deadline: the Tier 1 Antrean row's source. */
export async function keluhanTpuTerbukaAntrean(deps: Pick<LayananDeps, "db">): Promise<KeluhanTpuTerbukaAntrean[]> {
  const rows = await deps.db
    .select({ keluhan: keluhanLayananTpu, job: pekerjaanLayananTpu })
    .from(keluhanLayananTpu)
    .innerJoin(pekerjaanLayananTpu, eq(pekerjaanLayananTpu.id, keluhanLayananTpu.pekerjaanId))
    .where(eq(keluhanLayananTpu.status, "terbuka"))
    .orderBy(asc(keluhanLayananTpu.diajukanAt));
  return rows.map(({ keluhan, job }) => ({
    id: keluhan.id,
    pekerjaanId: job.id,
    nomor: job.nomor,
    label: job.label,
    tpuName: job.tpuName,
    diajukanAt: keluhan.diajukanAt,
    responPertamaDueAt: daytimeHoursDeadline(keluhan.diajukanAt, JAM_RESPON_PERTAMA_KELUHAN_TPU),
  }));
}

export type KeluhanTpuUntukPlatformResult =
  | {
      ok: true;
      keluhan: {
        id: string;
        pekerjaanId: string;
        status: "terbuka" | "ditolak" | "kerjakan_ulang";
        alasan: string;
        diajukanAt: Date;
        responPertamaDueAt: Date;
        diputuskanAt: Date | null;
        catatanKeputusan: string | null;
      };
      pekerjaan: {
        id: string;
        nomor: string;
        label: string;
        tpuName: string;
        targetDate: string;
        pemesanName: string;
        pemesanPhone: string | null;
        pemesanEmail: string | null;
      };
      /** What the Pemesan was shown, and when the window to complain ends. */
      bukti: BuktiTpuTerbaca[];
      ditunjukkanAt: Date | null;
      jendelaBerakhirAt: Date | null;
      /** The job's Pencairan item: what it pays and whether an override is still possible; null while it has not been recorded. */
      pencairan: { itemId: string; status: string; amount: number; amountAwal: number; catatan: string | null } | null;
      /** The Mitra Jasa the picker offers for this job: who may be named for a redo. */
      calon: MitraJasaTersedia[];
    }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" };

/** One Keluhan on a TPU job, for the screen where Admin Platform decides it. */
export async function keluhanTpuUntukPlatform(deps: LayananDeps, by: Actor, keluhanId: string): Promise<KeluhanTpuUntukPlatformResult> {
  const refusal = writeRefusal(by, "pekerjaan_tpu.kelola", pekerjaanTpuSemuaResource());
  if (refusal) return refusal;
  if (!z.uuid().safeParse(keluhanId).success) return { ok: false, reason: "tidak_ditemukan" };
  const [baris] = await deps.db
    .select({ keluhan: keluhanLayananTpu, job: pekerjaanLayananTpu })
    .from(keluhanLayananTpu)
    .innerJoin(pekerjaanLayananTpu, eq(pekerjaanLayananTpu.id, keluhanLayananTpu.pekerjaanId))
    .where(eq(keluhanLayananTpu.id, keluhanId));
  if (!baris) return { ok: false, reason: "tidak_ditemukan" };
  const { keluhan, job } = baris;
  const bukti = (await buktiTpuPerPekerjaan(deps, [job.id])).get(job.id) ?? [];
  const item = job.pencairanItemId ? await deps.payouts.itemLayananById(job.pencairanItemId) : null;
  const calon = await mitraJasaTersedia(deps, by, { tpuDkiId: job.tpuId, layananVariantId: job.layananVariantId, tanggal: job.targetDate });
  return {
    ok: true,
    keluhan: {
      id: keluhan.id,
      pekerjaanId: job.id,
      status: keluhan.status,
      alasan: keluhan.alasan,
      diajukanAt: keluhan.diajukanAt,
      responPertamaDueAt: daytimeHoursDeadline(keluhan.diajukanAt, JAM_RESPON_PERTAMA_KELUHAN_TPU),
      diputuskanAt: keluhan.diputuskanAt,
      catatanKeputusan: keluhan.catatanKeputusan,
    },
    pekerjaan: {
      id: job.id,
      nomor: job.nomor,
      label: job.label,
      tpuName: job.tpuName,
      targetDate: job.targetDate,
      pemesanName: job.pemesanName,
      pemesanPhone: job.pemesanPhone,
      pemesanEmail: job.pemesanEmail,
    },
    bukti,
    ditunjukkanAt: job.buktiDitunjukkanAt,
    jendelaBerakhirAt: jendelaKeluhanBerakhirAt(job.buktiDitunjukkanAt),
    pencairan: item ? { itemId: item.id, status: item.status, amount: item.amount, amountAwal: item.amountAwal, catatan: item.catatanPenyesuaian } : null,
    calon,
  };
}
