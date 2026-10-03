/**
 * Every Saat Duka TPU order still waiting for a confirmation, which the Antrean's
 * Tier 1 "Konfirmasi TPU Saat Duka" row is a projection of (spec, Work Queues;
 * ticket 45).
 *
 * The filter is the order's own status and nothing else, so the row closes by
 * itself: a confirmed order, a declined one, a cancelled one and an order moved
 * onto an offered TPU (which stays Diajukan and so stays in the row, because the
 * new TPU is not arranged yet) each decide it by their own state. The deadline
 * travels with the order rather than being computed here, so the two service
 * hours the TPU window promised at submission are the same fact the family was
 * told.
 */
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import { pengurusanTpu } from "./schema";

/** One order awaiting a confirmation, as the Tier 1 row reads it. */
export interface KonfirmasiTpu {
  id: string;
  nomor: string;
  almarhumName: string;
  tpuName: string;
  /** Two service hours on the TPU window, counted at submission; null only for a kind with no confirmation to promise. */
  konfirmasiDueAt: Date | null;
  /** The TPU offered instead, while the family has not answered; null when none is open. */
  tpuDitawarkan: { name: string } | null;
  /** When the family submitted the order: the Antrean row appears then, and its alert clocks count from it (ticket 28). */
  diajukanAt: Date;
}

/** Every Diajukan Saat Duka TPU order, oldest first. */
export async function konfirmasiTpuTerbuka(deps: { db: Database }): Promise<KonfirmasiTpu[]> {
  const rows = await deps.db
    .select({
      id: pengurusanTpu.id,
      nomor: pengurusanTpu.nomor,
      almarhumName: pengurusanTpu.almarhumName,
      tpuName: pengurusanTpu.tpuName,
      konfirmasiDueAt: pengurusanTpu.konfirmasiDueAt,
      tpuDitawarkanName: pengurusanTpu.tpuDitawarkanName,
      diajukanAt: pengurusanTpu.diajukanAt,
    })
    .from(pengurusanTpu)
    .where(and(eq(pengurusanTpu.kind, "saat_duka_tpu"), eq(pengurusanTpu.status, "diajukan")))
    .orderBy(asc(pengurusanTpu.diajukanAt), asc(pengurusanTpu.nomor));
  // Placing a Saat Duka TPU order requires its Almarhum; a row without one is not a burial to confirm and is not listed.
  return rows.flatMap((row) =>
    row.almarhumName === null
      ? []
      : [
          {
            id: row.id,
            nomor: row.nomor,
            almarhumName: row.almarhumName,
            tpuName: row.tpuName,
            konfirmasiDueAt: row.konfirmasiDueAt,
            tpuDitawarkan: row.tpuDitawarkanName ? { name: row.tpuDitawarkanName } : null,
            diajukanAt: row.diajukanAt,
          },
        ],
  );
}
