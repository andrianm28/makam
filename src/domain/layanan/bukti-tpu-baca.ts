/** Reading the captured proof of TPU jobs, for Admin Platform and for the Pemesan (ticket 57). Its own file so the order read and the approval need not import each other. */
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { LayananDeps } from "./deps";
import { BUKTI_URL_SECONDS } from "./bukti";
import type { BuktiPekerjaan } from "./pesanan-schema";
import { JAM_MS, jendelaKeluhanBerakhirAt } from "./keluhan";
import { keluhanLayananTpu, pekerjaanLayananTpu, pekerjaanLayananTpuBukti } from "./schema";

/** How long Admin Platform has to decide a proof once it is sent (Work Queues Tier 2, 24 h). */
export const BATAS_VERIFIKASI_BUKTI_JAM = 24;

/** One proof as Admin Platform and the Pemesan read it. */
export interface BuktiTpuTerbaca {
  kind: BuktiPekerjaan;
  takenAt: Date;
  url: string | null;
}

async function urlBukti(deps: LayananDeps, key: string): Promise<string | null> {
  try {
    return await deps.files.signedUrl(key, { expiresInSeconds: BUKTI_URL_SECONDS });
  } catch {
    return null;
  }
}

/** Every proof of the given jobs, grouped by job, each with a short-lived link. */
export async function buktiTpuPerPekerjaan(deps: LayananDeps, ids: string[]): Promise<Map<string, BuktiTpuTerbaca[]>> {
  const hasil = new Map<string, BuktiTpuTerbaca[]>();
  if (ids.length === 0) return hasil;
  const rows = await deps.db
    .select()
    .from(pekerjaanLayananTpuBukti)
    .where(inArray(pekerjaanLayananTpuBukti.pekerjaanId, ids))
    .orderBy(asc(pekerjaanLayananTpuBukti.takenAt));
  for (const row of rows) {
    const daftar = hasil.get(row.pekerjaanId) ?? [];
    daftar.push({ kind: row.kind, takenAt: row.takenAt, url: await urlBukti(deps, row.fileKey) });
    hasil.set(row.pekerjaanId, daftar);
  }
  return hasil;
}


/** A TPU job whose proof waits for Admin Platform, for the Tier 2 row. */
export interface PekerjaanTpuMenungguVerifikasi {
  id: string;
  nomor: string;
  label: string;
  tpuName: string;
  targetDate: string;
  dikirimAt: Date;
  /** 24 h after it was sent: when Admin Platform has to have decided. */
  batasVerifikasi: Date;
}

export async function pekerjaanTpuMenungguVerifikasi(db: Database): Promise<PekerjaanTpuMenungguVerifikasi[]> {
  const rows = await db
    .select()
    .from(pekerjaanLayananTpu)
    .where(and(eq(pekerjaanLayananTpu.status, "menunggu_verifikasi"), isNotNull(pekerjaanLayananTpu.buktiDikirimAt)))
    .orderBy(asc(pekerjaanLayananTpu.buktiDikirimAt));
  return rows.map((job) => ({
    id: job.id,
    nomor: job.nomor,
    label: job.label,
    tpuName: job.tpuName,
    targetDate: job.targetDate,
    dikirimAt: job.buktiDikirimAt as Date,
    batasVerifikasi: new Date((job.buktiDikirimAt as Date).getTime() + BATAS_VERIFIKASI_BUKTI_JAM * JAM_MS),
  }));
}


/**
 * When the Keluhan window of a TPU job opened (Admin Platform approved the proof), when it ends, and whether the
 * window-close tick has closed it: what the job's message thread reads to turn read-only. Null for no such job.
 */
export async function jendelaKeluhanTpu(db: Database, pekerjaanId: string): Promise<{ dibukaAt: Date | null; berakhirAt: Date | null; ditutup: boolean } | null> {
  const [job] = await db
    .select({ dibuka: pekerjaanLayananTpu.buktiDitunjukkanAt, ditutup: pekerjaanLayananTpu.jendelaDitutupAt })
    .from(pekerjaanLayananTpu)
    .where(eq(pekerjaanLayananTpu.id, pekerjaanId));
  if (!job) return null;
  return { dibukaAt: job.dibuka, berakhirAt: jendelaKeluhanBerakhirAt(job.dibuka), ditutup: job.ditutup !== null };
}


/** A job's Keluhan as its Pemesan reads it on the order: whether the form is on offer, until when, and what was filed. */
export interface KeluhanTpuPemesan {
  /** The job is Selesai, has no Keluhan yet and the 3×24 h window since its proof was shown is still open. */
  bolehDiajukan: boolean;
  berakhirAt: Date | null;
  diajukan: { status: "terbuka" | "ditolak" | "kerjakan_ulang" | "dana_kembali"; alasan: string; diajukanAt: Date } | null;
}

export async function keluhanTpuPerPekerjaan(
  db: Database,
  now: Date,
  jobs: { id: string; status: string; buktiDitunjukkanAt: Date | null }[],
): Promise<Map<string, KeluhanTpuPemesan>> {
  const diajukan = jobs.length === 0 ? [] : await db.select().from(keluhanLayananTpu).where(inArray(keluhanLayananTpu.pekerjaanId, jobs.map((job) => job.id)));
  const keluhanOf = new Map(diajukan.map((row) => [row.pekerjaanId, row] as const));
  return new Map(
    jobs.map((job) => {
      const berakhirAt = jendelaKeluhanBerakhirAt(job.buktiDitunjukkanAt);
      const ada = keluhanOf.get(job.id);
      return [
        job.id,
        {
          bolehDiajukan: !ada && job.status === "selesai" && berakhirAt !== null && now.getTime() <= berakhirAt.getTime(),
          berakhirAt,
          diajukan: ada ? { status: ada.status, alasan: ada.alasan, diajukanAt: ada.diajukanAt } : null,
        },
      ] as const;
    }),
  );
}
