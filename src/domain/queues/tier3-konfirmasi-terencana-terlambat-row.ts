/**
 * Tier 3 "Konfirmasi Terencana terlambat" (spec, Work Queues: "Tier 3: … Konfirmasi
 * Terencana terlambat"; ticket 37's AC 1): a Pemesanan Terencana still unconfirmed past
 * the end of the Lokasi's next working day, so Admin Platform can see the Lokasi is
 * behind.
 *
 * It is Tier 3 and not Tier 1, and the difference is the whole point: a Saat Duka order
 * is chased within hours because a burial is waiting, while a Terencairan is a plot held
 * with no date attached — the family waits a day and loses nothing, so the row is
 * Admin Platform's to look at, not something to call a Lokasi about at night. Tier 3
 * rows never alert (spec, Work Queues).
 *
 * **It cancels nothing.** A Terencairan has no automatic cancel (spec, Pemesanan >
 * Terencana: "Confirmation is due by the end of the Lokasi's next working day, with no
 * automatic cancel"), so a late confirmation costs the Lokasi a counted lateness
 * (`konfirmasiTerlambat`) and nothing else: the plots stay held and the family may still
 * pay. The row closes itself the moment the order is confirmed, declined or withdrawn.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

export const konfirmasiTerencanaTerlambatRowType: AntreanRowType = {
  key: "konfirmasi_terencana_terlambat",
  tier: 3,
  label: "Konfirmasi Terencana terlambat",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const lewat = await deps.pemesanan.konfirmasiTerencanaTerlambat();
    return lewat.map((order) => ({
      subjectKind: "pemesanan_terencana",
      subjectId: order.id,
      subjectLabel: `${order.nomor} · ${order.lokasi.name} · ${order.pemesan.name}`,
      // The staff page of a Terencairan order is the Admin Lokasi's own (it is the one
      // that can answer it), so the row points there and shows a message to CS if the
      // Lokasi's Admin is not in: an order is never chased through a page that 404s.
      href: `/staf/admin-lokasi/${order.lokasi.id}/pesanan/${order.nomor}`,
      // No deadline of its own: the order's own is the row's, which is why it is already
      // past by the time it appears.
      deadline: order.konfirmasiDueAt,
    }));
  },
};
