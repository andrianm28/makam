/**
 * The Antrean's Tier 4 "TPU flag stale" row (spec, Work Queues; story 148;
 * ticket 43): it opens once a DKI TPU's "menerima makam baru" flag has not been
 * checked for 14 days, so the Saat Duka list never offers a TPU that has closed
 * to new plots. It closes by itself when Admin Platform checks the flag again
 * (the Lokasi module stamps that date), and it never alerts: Tier 4 rows don't.
 */
import { addWibDays } from "@/lib/time/jakarta";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

/** How long a flag may go unchecked before this row asks for it. */
export const TPU_FLAG_STALE_DAYS = 14;

const tpuHref = (tpuId: string) => `/staf/admin-platform/tpu/${tpuId}`;

export const tpuFlagStaleRowType: AntreanRowType = {
  key: "tpu_flag_kedaluwarsa",
  tier: 4,
  label: "Cek status TPU",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const now = deps.clock.now();
    const tpu = await deps.lokasi.tpuDkiList(by);
    return tpu
      .map((item) => ({ item, deadline: addWibDays(item.flagUpdatedAt, TPU_FLAG_STALE_DAYS) }))
      // Stale from the moment the 14 days are up, not after the deadline: the row exists to have the flag checked.
      .filter(({ deadline }) => deadline.getTime() <= now.getTime())
      .map(
        ({ item, deadline }): RawAntreanRow => ({
          subjectKind: "tpu_dki",
          subjectId: item.id,
          subjectLabel: item.name,
          href: tpuHref(item.id),
          deadline,
        }),
      );
  },
};
