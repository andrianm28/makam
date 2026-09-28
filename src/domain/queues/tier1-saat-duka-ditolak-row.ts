/**
 * Tier 1 "Saat Duka ditolak" (spec, Work Queues: "Saat Duka ditolak (call
 * within 2 h)"; story 33; ticket 24's AC 4): a family whose order a Lokasi Mitra
 * could not serve, and which Admin Platform phones so that nobody is left
 * waiting alone. The email with the rebook link went out with the Tolak; this row
 * is the part an email cannot do.
 *
 * The row is a plain projection of two modules' own state — the Pemesanan
 * module's declined orders and Notifications' logged calls — so it needs no
 * change to close: it disappears the moment the call is logged
 * (`notifications.catatPanggilan`), and a declined order nobody has phoned stays
 * a row for ever rather than quietly ageing away.
 *
 * The two hours are **daytime** hours (`daytimeHoursDeadline`, the 06:00–18:00 WIB
 * window ticket 11 built for the Keluhan and the TPU clock), counted from the
 * decline and not from the submission: a family turned away at 17:00 is called at
 * 08:00 the next morning, and one turned away at 02:00 at 08:00 the same
 * morning. A plain "+2 h" would put the deadline at 04:00, when nobody is awake
 * to make the call.
 *
 * The deadline is daytime time, so a decline at 02:00 is still answered in the
 * morning: the row is announced at once (its subject is a Lokasi Mitra order,
 * never a TPU, so no 06:00 hold) and every Admin Platform is alerted again 30
 * minutes later while nobody has taken it (Ambil).
 */
import { daytimeHoursDeadline } from "@/domain/lokasi";
import type {
  AntreanRowDeps,
  AntreanRowType,
  RawAntreanRow,
} from "./row-types";

/** The Spec's "call within 2 h" of a declined order, in daytime hours. */
export const JAM_TELPON_SAAT_DUKA_DITOLAK = 2;

/** The subject kind the Pemesanan module's declined order opens its call row under. */
const SUBJECT = "pemesanan";

export const saatDukaDitolakRowType: AntreanRowType = {
  key: "saat_duka_ditolak",
  tier: 1,
  label: "Saat Duka ditolak",
  peringatan: { tpu: false, eskalasiMenit: [30] },
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const ditolak = await deps.pemesanan.saatDukaDitolak();
    const rows: RawAntreanRow[] = [];
    for (const order of ditolak) {
      // A family already reached on the phone is not a row any more: the call is
      // logged, and only the log is the truth of that.
      if (await deps.notifications.teleponPemesanTercatat(SUBJECT, order.id))
        continue;
      rows.push({
        subjectKind: "pemesanan_makam",
        subjectId: order.id,
        subjectLabel: `${order.nomor} · ${order.almarhum.name} · ${order.pemesan.name}`,
        // No Admin Platform page opens an order yet (ticket 25's order page is the
        // Lokasi's own), so the Antrean itself is where the call is placed from.
        href: "/staf/admin-platform/antrean",
        deadline: daytimeHoursDeadline(
          order.ditolakPada,
          JAM_TELPON_SAAT_DUKA_DITOLAK,
        ),
        // The row opens when the Lokasi Mitra declines, at the Clock's instant.
        openedAt: order.ditolakPada,
      });
    }
    return rows;
  },
};
