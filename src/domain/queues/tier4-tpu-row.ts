/**
 * The Antrean's Tier 4 "TPU flag stale" row (spec, Work Queues; story 148;
 * ticket 43): it opens once a DKI TPU's "menerima makam baru" flag has not been
 * checked for 14 days, so the Saat Duka list never offers a TPU that has closed
 * to new plots. It closes by itself when Admin Platform checks the flag again
 * (the Lokasi module stamps that date), and it never alerts: Tier 4 rows don't.
 */
import { addWibDays } from "@/lib/time/jakarta";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { isDue } from "./tier4-shared";

/** How long a flag may go unchecked before this row asks for it. */
export const TPU_FLAG_STALE_DAYS = 14;

export const tpuFlagStaleRowType: AntreanRowType = {
  key: "tpu_flag_kedaluwarsa",
  tier: 4,
  label: "Cek status TPU",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const now = deps.clock.now();
    const tpu = await deps.lokasi.tpuDkiList(by);
    const rows: RawAntreanRow[] = [];
    for (const item of tpu) {
      const deadline = addWibDays(item.flagUpdatedAt, TPU_FLAG_STALE_DAYS);
      if (!isDue(deadline, now)) continue;
      rows.push({
        subjectKind: "tpu_dki",
        subjectId: item.id,
        subjectLabel: item.name,
        href: `/staf/admin-platform/tpu/${item.id}`,
        deadline,
        openedAt: null,
      });
    }
    return rows;
  },
};
