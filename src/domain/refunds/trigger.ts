/**
 * The materialising tick: turns every Tagihan Billing flagged for a refund
 * (`batalkanTagihan`, ticket 24) into a request here, unless one already
 * exists. Idempotent, like every scheduler tick (AGENTS.md): the unique index on
 * (tagihanId, "pembatalan") makes a second run a no-op.
 *
 * Who is at fault comes from why the Tagihan was cancelled: today only a
 * Pemesan's cancellation (`pemesanan_dibatalkan`) is flagged by Billing, so
 * only that has a fault to map. A caller with another fault (Terlambat,
 * Berhenti) names it through `Refunds.ajukanDariPembatalan`.
 */
import type { Database } from "@/db/client";
import type { Billing } from "@/domain/billing";
import { materialisasiDariPembatalan } from "./request";

export interface TickResult {
  materialised: number;
}

export async function tickRefunds(deps: { db: Database; billing: Pick<Billing, "tagihanMenungguPengembalian"> }, now: Date): Promise<TickResult> {
  const menunggu = await deps.billing.tagihanMenungguPengembalian();
  let materialised = 0;
  for (const tagihan of menunggu) {
    if (tagihan.cancelledReason !== "pemesanan_dibatalkan") continue;
    const raised = await materialisasiDariPembatalan(deps.db, now, tagihan, "pemesan");
    if (raised) materialised += 1;
  }
  return { materialised };
}
