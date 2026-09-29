/**
 * Tier 3 "refund transfer" (spec, Work Queues: "refund transfers (2 working
 * days after approval)"; ticket 31's AC 3). One row per approved request: it
 * appears the moment Admin Platform approves a refund and closes the moment
 * the transfer's proof is uploaded — a plain projection of the Refunds
 * module's own query, exactly like the Tier 3 "Pencairan" row is a projection
 * of Payouts'.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { formatRupiah } from "@/lib/rupiah";

/** No Admin Platform refunds screen is built yet (the design system's menu has no slot, like Pencairan's), so the row is chased here. */
const HREF = "/staf/admin-platform/pengembalian";

export const pengembalianRowType: AntreanRowType = {
  key: "pengembalian",
  tier: 3,
  label: "Pengembalian dana disetujui",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const disetujui = await deps.refunds.pengembalianJatuhTempo();
    return disetujui.map((row) => ({
      subjectKind: "permintaan_pengembalian",
      subjectId: row.id,
      subjectLabel: `${row.nomorTagihan} · ${formatRupiah(row.jumlah)}`,
      href: HREF,
      deadline: row.tenggatTransferPada,
    }));
  },
};
