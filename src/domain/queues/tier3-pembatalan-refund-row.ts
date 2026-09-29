/**
 * Tier 3 "Pembatalan refund approval" (spec, Work Queues: "Pembatalan refund approval (2 working days)"; ticket
 * 38's AC 4): the refund an Admin Lokasi's approval of a Pembatalan asked of Refunds, waiting for Admin
 * Platform to approve it. It appears the moment the Lokasi approves and closes the moment the refund request is
 * approved in Refunds (where the "refund transfer" row takes over), a plain projection of the Pemesanan module's
 * own read. Its deadline is 2 Hari Kerja on Admin Platform's calendar from the Lokasi's approval.
 */
import { formatRupiah } from "@/lib/rupiah";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

/** The refunds screen, where the request is approved. */
const HREF = "/staf/admin-platform/pengembalian";

export const pembatalanRefundRowType: AntreanRowType = {
  key: "pembatalan_refund",
  tier: 3,
  label: "Pembatalan refund approval",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const menunggu = await deps.pemesanan.persetujuanRefundPembatalan();
    return menunggu.map((satu) => ({
      subjectKind: "permintaan_pembatalan_terencana",
      subjectId: satu.id,
      subjectLabel: `${satu.nomor} · ${formatRupiah(satu.jumlahRefund)} · ${satu.lokasi.name}`,
      href: HREF,
      deadline: satu.tenggatPada,
    }));
  },
};
