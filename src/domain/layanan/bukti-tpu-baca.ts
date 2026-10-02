/** Reading the captured proof of TPU jobs, for Admin Platform and for the Pemesan (ticket 57). Its own file so the order read and the approval need not import each other. */
import { asc, inArray } from "drizzle-orm";
import type { LayananDeps } from "./deps";
import { BUKTI_URL_SECONDS } from "./bukti";
import type { BuktiPekerjaan } from "./pesanan-schema";
import { pekerjaanLayananTpuBukti } from "./schema";

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

