/**
 * Tier 2 "Pembayaran Perlu Ditinjau" (spec-missing; from ticket 19's review,
 * 2026-09-26, see 17-admin-platform-antrean.md): Billing records money it
 * cannot settle a Tagihan with (a payment on a Dibatalkan Tagihan, a wrong
 * amount, an unknown or double payment) as a Pembayaran Perlu Ditinjau, its
 * own public query. This row is a plain projection of that query, so it
 * closes itself the moment Billing's own list stops naming it: ticket 31
 * (Refunds) is where a Pembayaran Perlu Ditinjau is resolved (usually by an
 * approved refund), and once it does, nothing here needs to change for the
 * row to disappear.
 *
 * No deadline: the spec gives this row no SLA of its own (it is not in any
 * tier list yet), so it never shows past its deadline; it is still Tier 2, so
 * it still alerts.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { formatRupiah } from "@/lib/rupiah";

/** The Antrean itself, for an entry whose money names no known Tagihan at all (`tagihan` is null). */
const FALLBACK_HREF = "/staf/admin-platform/antrean";

export const pembayaranPerluDitinjauRowType: AntreanRowType = {
  key: "pembayaran_perlu_ditinjau",
  tier: 2,
  label: "Pembayaran perlu ditinjau",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const entries = await deps.billing.pembayaranPerluDitinjau();
    return entries.map((entry) => ({
      subjectKind: "pembayaran_perlu_ditinjau",
      subjectId: entry.id,
      subjectLabel: `${entry.tagihan?.nomorTagihan ?? entry.providerPaymentId} · ${formatRupiah(entry.amount)}`,
      // Ticket 30: the Tagihan page now exists (`/staf/admin-platform/tagihan/[tagihanId]`),
      // so a row that names one opens it directly, where the money can be
      // resolved by hand (e.g. recorded as a manual payment) if that is the answer.
      href: entry.tagihan ? `/staf/admin-platform/tagihan/${entry.tagihan.id}` : FALLBACK_HREF,
      deadline: null,
    }));
  },
};
