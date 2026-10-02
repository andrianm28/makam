/** The Terlambat flag of TPU jobs (ticket 57): the worker's tick, in its own file beside the other jobs' ticks. */
import { and, inArray, lte } from "drizzle-orm";
import type { Database } from "@/db/client";
import { addWibDateDays, wibDateOf } from "@/lib/time/jakarta";
import { HARI_TERLAMBAT } from "./pekerjaan";
import { pekerjaanLayananTpu } from "./schema";

/**
 * The worker's tick: a TPU job two days past its target date that has not been sent for approval
 * is flagged Terlambat (spec, Pekerjaan Layanan). The flag changes no pay: a Terlambat job that
 * is done after all is paid in full when its proof is approved. Idempotent: a flagged job is
 * no longer in the states the tick looks at. Returns how many jobs it flagged.
 */
export async function tandaiTerlambatTpu(db: Database, now: Date): Promise<number> {
  const batas = addWibDateDays(wibDateOf(now), -HARI_TERLAMBAT);
  const ditandai = await db
    .update(pekerjaanLayananTpu)
    .set({ status: "terlambat" })
    .where(and(inArray(pekerjaanLayananTpu.status, ["dijadwalkan", "sedang_dikerjakan"]), lte(pekerjaanLayananTpu.targetDate, batas)))
    .returning({ id: pekerjaanLayananTpu.id });
  return ditandai.length;
}

