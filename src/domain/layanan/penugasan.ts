/**
 * Who may take one TPU job (spec, Layanan > Mitra Jasa > "Hand assignment
 * through a hard-filtered picker"; ticket 55's half of it, ticket 56's picker).
 *
 * This is the *filter*, and the readiness data behind it: a Mitra Jasa is a
 * candidate for a job at a DKI TPU for a Layanan variant on a target date when
 * three things are all true, and this module is the one place that says so.
 *
 * 1. they are `aktif` — a `Ditangguhan` or `Berhenti` Mitra Jasa takes no new
 *    work, however good their record is;
 * 2. their coverage lists include that TPU **and** that Layanan variant;
 * 3. no "Tidak tersedia" range of theirs covers that date.
 *
 * The picker that calls it (ticket 56) adds no filter of its own to these three;
 * if it needs a fourth (an accept deadline, a rate, how many jobs someone already
 * holds), that is a change here so there is one rule, not two.
 */
import { and, asc, eq, notExists, sql } from "drizzle-orm";
import type { Actor } from "@/domain/identity";
import { semuaMitraJasaResource, writeRefusal } from "@/domain/identity";
import type { LayananDeps } from "./deps";
import { layananMitraJasa, layananMitraJasaLayanan, layananMitraJasaTidakTersedia, layananMitraJasaTpu } from "./schema";
import { BARU_SAMPAI_SELESAI } from "./mitra-jasa";
import { kebutuhanPenugasanSchema } from "./mitra-jasa-skema";

/** One Mitra Jasa the picker may offer a job to. */
export interface MitraJasaTersedia {
  id: string;
  namaLengkap: string;
  email: string;
  /** How many jobs they have finished, and whether the "Baru" badge still shows. */
  selesai: number;
  baru: boolean;
}

/**
 * Every Mitra Jasa who may take this job, by name (Admin Platform only, which is
 * the only role that assigns work; an empty list for anyone else). Empty when the
 * input does not name a real job's needs.
 */
export async function mitraJasaTersedia(
  deps: LayananDeps,
  by: Actor,
  input: unknown,
): Promise<MitraJasaTersedia[]> {
  if (writeRefusal(by, "mitra_jasa.lihat_semua", semuaMitraJasaResource())) return [];
  const parsed = kebutuhanPenugasanSchema.safeParse(input);
  if (!parsed.success) return [];
  const { tpuDkiId, layananVariantId, tanggal } = parsed.data;

  const rows = await deps.db
    .select({ id: layananMitraJasa.id, namaLengkap: layananMitraJasa.namaLengkap, email: layananMitraJasa.email })
    .from(layananMitraJasa)
    .innerJoin(
      layananMitraJasaTpu,
      and(eq(layananMitraJasaTpu.mitraJasaId, layananMitraJasa.id), eq(layananMitraJasaTpu.tpuDkiId, tpuDkiId)),
    )
    .innerJoin(
      layananMitraJasaLayanan,
      and(
        eq(layananMitraJasaLayanan.mitraJasaId, layananMitraJasa.id),
        eq(layananMitraJasaLayanan.layananVariantId, layananVariantId),
      ),
    )
    .where(
      and(
        eq(layananMitraJasa.status, "aktif"),
        notExists(
          deps.db
            .select({ satu: layananMitraJasaTidakTersedia.id })
            .from(layananMitraJasaTidakTersedia)
            .where(
              and(
                eq(layananMitraJasaTidakTersedia.mitraJasaId, layananMitraJasa.id),
                sql`${layananMitraJasaTidakTersedia.dari} <= ${tanggal}`,
                sql`${layananMitraJasaTidakTersedia.sampai} >= ${tanggal}`,
              ),
            ),
        ),
      ),
    )
    .orderBy(asc(layananMitraJasa.namaLengkap), asc(layananMitraJasa.id));

  const withBadge: MitraJasaTersedia[] = [];
  for (const row of rows) {
    const selesai = (await deps.pekerjaan.daftarPekerjaan(row.id)).filter((job) => job.status === "selesai").length;
    withBadge.push({ ...row, selesai, baru: selesai < BARU_SAMPAI_SELESAI });
  }
  return withBadge;
}

/** How many Mitra Jasa the picker may offer a job to; the empty-state message's number. */
export async function jumlahMitraJasaTersedia(deps: LayananDeps, by: Actor, input: unknown): Promise<number> {
  return (await mitraJasaTersedia(deps, by, input)).length;
}
