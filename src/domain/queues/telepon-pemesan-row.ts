/**
 * Tier 2 "Telepon Pemesan" (ticket 20): a family must be called. Opened when
 * a money message finally fails (after its retries) or when a family must
 * act and the order has no email; closed once a staff member logs the call
 * (`notifications.catatPanggilan`), so this row is a plain projection of
 * `notifications.teleponPemesanTerbuka()` and needs no change to close.
 *
 * This row lists money subjects (`subjectKind` "tagihan"): failed Tagihan,
 * reminder and Bukti emails, and orders with no email; and a Makam TPU whose IPTM
 * is nearing its end with no email on record (`subjectKind` "makam_tpu", ticket 48). Tickets 29 (a Saat
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
  // A Saat Duka Tagihan Lewat Jatuh Tempo (spec, Work Queues Tier 2; ticket 29): the
  // Tier 3 "Tagihan lewat jatuh tempo" row tracks the Tagihan itself, this one the call.
  tagihan_lewat_jatuh_tempo: "Tagihan lewat jatuh tempo, hubungi keluarga",
  hak_pakai_berakhir: "Hak Pakai segera berakhir, telepon Pemegang Hak",
} as const;

export const teleponPemesanRowType: AntreanRowType = {
  key: "telepon_pemesan",
  tier: 2,
  label: "Telepon Pemesan",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const terbuka = await deps.notifications.teleponPemesanTerbuka();
    return terbuka
      .filter((telepon) => telepon.subjectKind === "tagihan" || telepon.subjectKind === "makam_tpu")
      .map((telepon) => ({
        subjectKind: "telepon_pemesan",
        subjectId: telepon.id,
        // A Makam TPU has no Nomor of its own: its row says what to tell the Pemegang Hak.
        subjectLabel:
          telepon.subjectKind === "makam_tpu"
            ? (telepon.perihal ?? `IPTM segera berakhir · ${SEBAB_LABEL[telepon.sebab]}`)
            : `${telepon.nomorTagihan ?? telepon.subjectId} · ${SEBAB_LABEL[telepon.sebab] ?? telepon.sebab}`,
        // Chasing's own overdue-list page reads a Tagihan by id (ticket 29); every other money subject still has none.
        href: telepon.sebab === "tagihan_lewat_jatuh_tempo" ? "/staf/admin-platform/tagihan-lewat-jatuh-tempo" : FALLBACK_HREF,
        deadline: null,
      }));
  },
};
