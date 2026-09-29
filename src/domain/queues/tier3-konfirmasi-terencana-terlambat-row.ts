/**
 * Tier 3 "Konfirmasi Terencana terlambat" (spec, Work Queues; ticket 37's AC 1): a
 * Pemesanan Terencana whose Lokasi Mitra has not answered by the end of its next
 * working day, so Admin Platform chases the Lokasi instead of waiting.
 *
 * Nothing happens to the order itself — there is no automatic cancel, and the plots
 * stay held. The row is a plain projection of the Pemesanan module's own state and
 * needs no change to close: it disappears the moment the order is confirmed, declined
 * or withdrawn. Its deadline is the order's own, which is why it is already past by
 * the time it appears.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

export const konfirmasiTerencanaTerlambatRowType: AntreanRowType = {
  key: "konfirmasi_terencana_terlambat",
  tier: 3,
  label: "Konfirmasi Terencana terlambat",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const lewat = await deps.pemesanan.konfirmasiTerencanaLewatTenggat();
    return lewat.map((order) => ({
      subjectKind: "pemesanan_terencana",
      subjectId: order.id,
      subjectLabel: `${order.nomor} · ${order.unit.map((unit) => unit.nomor).join(", ")} · ${order.lokasi.name}`,
      // No Admin Platform page opens an order (the order page is the Lokasi's own), so the Antrean itself is where it is chased.
      href: "/staf/admin-platform/antrean",
      deadline: order.konfirmasiDueAt,
    }));
  },
};
