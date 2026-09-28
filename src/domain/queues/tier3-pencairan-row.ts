/**
 * Tier 3 "Pencairan" (spec, Work Queues: "Tier 3: … Pencairan (2 working days
 * after due)"; ticket 32's AC 6). One row per **recipient**: a transfer is per
 * recipient, so a row per recipient is the unit of work Admin Platform actually
 * does, and its deadline is the earliest of that recipient's items.
 *
 * The row is a plain projection of the Payouts module's own query, so it closes
 * itself the moment the state it reads moves on: the items are transferred (or
 * held out with a reason, which is a decision already taken and not open work),
 * and the row is gone. It is Tier 3, so it never alerts (spec, Work Queues: only
 * Tier 1 and 2 do), and the 2 Hari Kerja deadline is the one the Payouts module
 * stamped on the item when it became due — read here, never recalculated.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { formatRupiah } from "@/lib/rupiah";

/** No Admin Platform Pencairan screen is built yet (the run is reached through the Antrean), so the row is chased here. */
const HREF = "/staf/admin-platform/antrean";

export const pencairanRowType: AntreanRowType = {
  key: "pencairan",
  tier: 3,
  label: "Pencairan jatuh tempo",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const waiting = await deps.payouts.pencairanJatuhTempo();
    return waiting.map((row) => ({
      subjectKind: "penerima_pencairan",
      subjectId: row.recipientKey,
      subjectLabel: `${row.recipient.nama} · ${row.itemCount} item · ${formatRupiah(row.amount)}`,
      href: HREF,
      deadline: row.jatuhTempoAt,
      openedAt: null,
    }));
  },
};
