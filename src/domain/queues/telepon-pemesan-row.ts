/**
 * Tier 2 "Telepon Pemesan" (ticket 20): a family must be called. Opened when
 * a money message finally fails (after its retries) or when a family must
 * act and the order has no email; closed once a staff member logs the call
 * (`notifications.catatPanggilan`), so this row is a plain projection of
 * `notifications.teleponPemesanTerbuka()` and needs no change to close.
 *
 * This row lists money subjects (`subjectKind` "tagihan"): failed Tagihan,
 * reminder and Bukti emails, and orders with no email. Tickets 29 (a Saat
 * Duka Tagihan Lewat Jatuh Tempo) and 42 (a Hak Pakai nearing its end) open
 * rows for their own subjects. A declined order keeps ticket 24's Tier 1 call.
 *
 * No deadline: the spec gives this row no SLA of its own, so it never shows
 * past its deadline; it is still Tier 2, so it still alerts.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

/** No admin page reads a Tagihan by id yet (only by its unguessable link, which this row is not given); the Antrean itself until one exists. */
const FALLBACK_HREF = "/staf/admin-platform/antrean";

const SEBAB_LABEL = {
  pesan_gagal: "email gagal terkirim",
  tanpa_email: "pesanan tanpa email",
  // A declined order's row is Tier 1 (spec, Work Queues) and is read by that row
  // type, not by this Tier 2 one; the label keeps a stray row readable all the same.
  saat_duka_ditolak: "pesanan ditolak, keluarga harus ditelepon",
} as const;

export const teleponPemesanRowType: AntreanRowType = {
  key: "telepon_pemesan",
  tier: 2,
  label: "Telepon Pemesan",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const terbuka = await deps.notifications.teleponPemesanTerbuka();
    return terbuka
      .filter((telepon) => telepon.subjectKind === "tagihan")
      .map((telepon) => ({
        subjectKind: "telepon_pemesan",
        subjectId: telepon.id,
        subjectLabel: `${telepon.nomorTagihan ?? telepon.subjectId} · ${SEBAB_LABEL[telepon.sebab] ?? telepon.sebab}`,
        href: FALLBACK_HREF,
        deadline: null,
      }));
  },
};
