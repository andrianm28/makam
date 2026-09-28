/**
 * Tier 3 "refund transfer" (spec, Work Queues: "Tier 3: … refund transfers";
 * ticket 31's AC 3: "a Tier 3 'refund transfer' row appears on approval with a
 * 2-working-day deadline (Admin Platform calendar, ticket 11) and closes when the
 * proof is uploaded").
 *
 * The row is a plain projection of the Refunds flow's own query, so it closes
 * itself the moment the state it reads moves on: the transfer is recorded and the
 * refund is no longer `disetujui`, and the row is gone. It is Tier 3, so it never
 * alerts (spec, Work Queues: only Tier 1 and 2 do), and the 2 Hari Kerja deadline
 * is the one stamped on the refund **at approval** — read here, never recalculated,
 * exactly as a Pencairan item's own deadline is stamped by the trigger that made it
 * due.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { formatRupiah } from "@/lib/rupiah";

/** No Admin Platform refund screen is built yet (the flow is reached through the Antrean), so the row is chased here. */
const HREF = "/staf/admin-platform/antrean";

export const pengembalianRowType: AntreanRowType = {
  key: "pengembalian",
  tier: 3,
  label: "Transfer pengembalian dana",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const waiting = await deps.payouts.pengembalianSiapDitransfer();
    return waiting.map((row) => ({
      subjectKind: "pengembalian",
      subjectId: row.id,
      subjectLabel: `${row.nomorTagihan} · ${row.pemesanNama} · ${formatRupiah(row.jumlah)}`,
      href: HREF,
      deadline: row.jatuhTempoAt,
    }));
  },
};
