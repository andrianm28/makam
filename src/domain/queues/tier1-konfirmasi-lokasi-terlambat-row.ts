/**
 * Tier 1 "Konfirmasi Lokasi terlambat" (spec, Work Queues: "Tier 1: … Konfirmasi
 * Lokasi terlambat"; ticket 23's AC 7): a Saat Duka order whose confirmation
 * deadline has passed, so Admin Platform phones the Lokasi instead of waiting.
 *
 * The row is a plain projection of the Pemesanan module's own state and needs no
 * change to close: it disappears the moment the order is confirmed or declined.
 * It is Tier 1, so it alerts (ticket 28): the row is announced the moment the
 * deadline passes — which is its `deadline` and its `openedAt` alike — and every
 * Admin Platform is alerted again 30 minutes later while nobody has taken it
 * (Ambil). Its subject is a Lokasi Mitra order, never a TPU, so the night 06:00
 * hold does not apply to it.
 */
import type {
  AntreanRowDeps,
  AntreanRowType,
  RawAntreanRow,
} from "./row-types";

export const konfirmasiLokasiTerlambatRowType: AntreanRowType = {
  key: "konfirmasi_lokasi_terlambat",
  tier: 1,
  label: "Konfirmasi Lokasi terlambat",
  peringatan: { tpu: false, eskalasiMenit: [30] },
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const lewat = await deps.pemesanan.konfirmasiLewatTenggat();
    return lewat.map((order) => ({
      subjectKind: "pemesanan_makam",
      subjectId: order.id,
      subjectLabel: `${order.nomor} · ${order.almarhum.name} · ${order.lokasi.name}`,
      // No Admin Platform page opens an order yet (ticket 25's order page is the Lokasi's own), so the Antrean itself is where it is chased.
      href: "/staf/admin-platform/antrean",
      deadline: order.konfirmasiDueAt,
      // The row opens when the confirmation deadline passes, which is what the
      // Lokasi's own Jam Operasional gave.
      openedAt: order.konfirmasiDueAt,
    }));
  },
};
