/**
 * A Penilaian of a finished TPU job (spec, Layanan > Pekerjaan Layanan; story 95; CONTEXT.md "Penilaian"; ticket 123): the
 * same optional 1–5 stars with a comment that a Lokasi Mitra's job takes (`beriPenilaian`, ticket 51), kept in the TPU
 * job's own table because a TPU job is not a `pekerjaan_layanan` row.
 */
import { desc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { normaliseEmail } from "@/domain/identity";
import type { LayananDeps, PemesanLayanan } from "./deps";
import type { PenilaianDenganPekerjaan } from "./keluhan";
import { beriPenilaianSchema } from "./pesanan-schema";
import { pekerjaanLayananTpu, penilaianLayananTpu } from "./schema";

/**
 * Whether a job may be rated: it was finished (Admin Platform approved its proof) and was not cancelled. There is no
 * deadline, as there is none at a Lokasi Mitra (`bolehDinilai`, ticket 51); a job under a Keluhan may still be rated.
 */
function bisaDinilai(job: { status: string; selesaiAt: Date | null }): boolean {
  return job.status !== "dibatalkan" && job.selesaiAt !== null;
}

/** A job's Penilaian as its Pemesan reads it on the order: whether the form is on offer, and whether one was given (the stars are not read back). */
export interface PenilaianTpuPemesan {
  bolehDinilai: boolean;
  dinilai: boolean;
}

/** What the order page needs to offer a Penilaian on each of these jobs. */
export async function penilaianTpuPerPekerjaan(
  db: Database,
  jobs: { id: string; status: string; selesaiAt: Date | null }[],
): Promise<Map<string, PenilaianTpuPemesan>> {
  const diberi = jobs.length === 0 ? [] : await db.select({ id: penilaianLayananTpu.pekerjaanId }).from(penilaianLayananTpu).where(inArray(penilaianLayananTpu.pekerjaanId, jobs.map((job) => job.id)));
  const dinilai = new Set(diberi.map((row) => row.id));
  return new Map(jobs.map((job) => [job.id, { bolehDinilai: !dinilai.has(job.id) && bisaDinilai(job), dinilai: dinilai.has(job.id) }] as const));
}

export type BeriPenilaianTpuResult =
  | { ok: true }
  | { ok: false; reason: "input_tidak_valid" | "bukan_pemesan" | "tidak_ditemukan" | "belum_selesai" | "sudah_dinilai" };

/** The Pemesan rates one finished TPU job, 1–5 stars with an optional comment, once. */
export async function beriPenilaianTpu(deps: LayananDeps, pemesan: PemesanLayanan, rawInput: unknown): Promise<BeriPenilaianTpuResult> {
  const parsed = beriPenilaianSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: "input_tidak_valid" };
  const { pekerjaanId, bintang, komentar } = parsed.data;
  const email = normaliseEmail(pemesan.email);
  const akun = email === null ? null : await deps.identity.accountByEmail(email);
  if (!akun || akun.id !== pemesan.accountId) return { ok: false, reason: "bukan_pemesan" };
  const [job] = await deps.db
    .select({ status: pekerjaanLayananTpu.status, selesaiAt: pekerjaanLayananTpu.selesaiAt, pemesanAccountId: pekerjaanLayananTpu.pemesanAccountId })
    .from(pekerjaanLayananTpu)
    .where(eq(pekerjaanLayananTpu.id, pekerjaanId));
  // Somebody else's order is "not found", as everywhere a family reads an order.
  if (!job || job.pemesanAccountId !== pemesan.accountId) return { ok: false, reason: "tidak_ditemukan" };
  // Finished means Admin Platform approved the proof: a job still waiting for it, or one that was cancelled, has nothing to rate yet.
  if (!bisaDinilai(job)) return { ok: false, reason: "belum_selesai" };
  const [ditulis] = await deps.db
    .insert(penilaianLayananTpu)
    .values({ pekerjaanId, pemesanAccountId: pemesan.accountId, bintang, komentar, dibuatAt: deps.clock.now() })
    .onConflictDoNothing()
    .returning({ id: penilaianLayananTpu.id });
  return ditulis ? { ok: true } : { ok: false, reason: "sudah_dinilai" };
}

/**
 * Every Penilaian of a TPU job, newest first, in the shape of Admin Platform's one list (`daftarPenilaian`, which merges it
 * with a Lokasi Mitra's): a TPU is named where the Lokasi is, and the grave as the family described it where the Petak is.
 * Each comes with its own id, so the merged list can keep the order it had.
 */
export async function penilaianTpuUntukDaftar(db: Database, limit: number): Promise<{ id: string; nilai: PenilaianDenganPekerjaan }[]> {
  const rows = await db
    .select({ nilai: penilaianLayananTpu, job: pekerjaanLayananTpu })
    .from(penilaianLayananTpu)
    .innerJoin(pekerjaanLayananTpu, eq(pekerjaanLayananTpu.id, penilaianLayananTpu.pekerjaanId))
    .orderBy(desc(penilaianLayananTpu.dibuatAt), desc(penilaianLayananTpu.id))
    .limit(limit);
  return rows.map(({ nilai, job }) => ({
    id: nilai.id,
    nilai: {
      sumber: "tpu" as const,
      pekerjaanId: nilai.pekerjaanId,
      bintang: nilai.bintang,
      komentar: nilai.komentar,
      dibuatAt: nilai.dibuatAt,
      lokasi: { id: job.tpuId, name: job.tpuName },
      petak: job.makam.blokNomor,
      pesanan: job.nomor,
      label: job.label,
    },
  }));
}
