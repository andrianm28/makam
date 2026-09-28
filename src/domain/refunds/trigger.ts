/**
 * The materialising tick: turns every Tagihan Billing flagged for a refund
 * (`batalkanTagihan`, ticket 24) into a request here, unless one already
 * exists. Idempotent, like every scheduler tick (AGENTS.md): the unique index
 * on (tagihanId, "pembatalan_pemesan") makes a second run of the same fact a
 * no-op, and Billing's own list does not know whether Refunds has already
 * acted on a row — this is the one place that checks.
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
    const raised = await materialisasiDariPembatalan(deps.db, now, tagihan);
    if (raised) materialised += 1;
  }
  return { materialised };
}
