/**
 * Tier 3 "Setor Retribusi" (spec, Work Queues: "Setor Retribusi (2 working days
 * after Lunas, only for a non-zero Retribusi Pemda line)"; ticket 45, AC 7).
 * A family's Retribusi Pemda is not the Operator's to keep: it is handed to the
 * town, and until that is recorded the Operator is the one holding someone
 * else's money.
 *
 * The row is a plain projection of the Field Work module's open setorans (which
 * is Billing's Lunas Retribusi Tagihan minus the recorded ones), so recording
 * the payment closes the row with no change here, and a Rp 0 line never opens
 * one — every Retribusi is Rp 0 today, so v1 builds the structure only.
 *
 * The deadline is the two working days after Lunas the Field Work module
 * computed on the Admin Platform calendar (ticket 11), carried here rather than
 * recomputed, so a weekend or a Hari Libur moves the row and its deadline
 * together.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

/** Where the open setorans are listed and the payment is recorded. */
export const SETOR_RETRIBUSI_HREF = "/staf/admin-platform/setor-retribusi";

export const setorRetribusiRowType: AntreanRowType = {
  key: "setor_retribusi",
  tier: 3,
  label: "Setor Retribusi",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const terbuka = await deps.fieldwork.setorRetribusiTerbuka();
    return terbuka.map((setor) => ({
      subjectKind: "setor_retribusi",
      subjectId: setor.tagihanId,
      subjectLabel: `${setor.nomorTagihan}${setor.placeName ? ` · ${setor.placeName}` : ""}`,
      href: SETOR_RETRIBUSI_HREF,
      deadline: setor.dueAt,
    }));
  },
};
