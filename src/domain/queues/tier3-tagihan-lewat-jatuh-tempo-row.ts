/**
 * Tier 3 "Tagihan lewat jatuh tempo" (spec, Work Queues: "Tier 3: … Tagihan
 * lewat jatuh tempo"; ticket 29). A plain projection of Billing's own overdue
 * query: the row closes itself the moment the Tagihan is Lunas or Tidak
 * Tertagih is declared and the Hak Pakai ended. Never alerts (Tier 3, spec,
 * Work Queues), and the deadline is when it went overdue: the same instant
 * the Chasing reminders and the overdue list itself count from.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { formatRupiah } from "@/lib/rupiah";

const HREF = "/staf/admin-platform/tagihan-lewat-jatuh-tempo";

export const tagihanLewatJatuhTempoRowType: AntreanRowType = {
  key: "tagihan_lewat_jatuh_tempo",
  tier: 3,
  label: "Tagihan lewat jatuh tempo",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const overdue = await deps.billing.tagihanLewatJatuhTempo();
    return overdue
      .filter((t) => t.status === "lewat_jatuh_tempo")
      .map((t) => ({
        subjectKind: "tagihan",
        subjectId: t.id,
        subjectLabel: `${t.nomorTagihan}${t.placeName ? ` · ${t.placeName}` : ""} · ${formatRupiah(t.total)}`,
        href: HREF,
        deadline: t.lewatJatuhTempoAt,
      }));
  },
};
