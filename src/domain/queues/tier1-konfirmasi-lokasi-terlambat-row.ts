/**
 * Tier 1 "Konfirmasi Lokasi terlambat" (spec, Work Queues: "Tier 1: … Konfirmasi
 * Lokasi terlambat"; ticket 23's AC 7): a Saat Duka order whose confirmation
 * deadline has passed, so Admin Platform phones the Lokasi instead of waiting.
 *
 * The row is a plain projection of the Pemesanan module's own state and needs no
 * change to close: it disappears the moment the order is confirmed or declined.
 * It is Tier 1, so it alerts once built; its deadline is the order's own, which
 * is why it is already past by the time it appears.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

export const konfirmasiLokasiTerlambatRowType: AntreanRowType = {
  key: "konfirmasi_lokasi_terlambat",
  tier: 1,
  label: "Konfirmasi Lokasi terlambat",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const lewat = await deps.pemesanan.konfirmasiLewatTenggat();
    return lewat.map((order) => ({
      subjectKind: "pemesanan_makam",
      subjectId: order.id,
      subjectLabel: `${order.nomor} · ${order.almarhum.name} · ${order.lokasi.name}`,
      // No Admin Platform page opens an order yet (ticket 25's order page is the Lokasi's own), so the Antrean itself is where it is chased.
      href: "/staf/admin-platform/antrean",
      deadline: order.konfirmasiDueAt,
    }));
  },
};
