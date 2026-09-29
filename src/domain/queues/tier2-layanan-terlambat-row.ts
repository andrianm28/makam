/**
 * Tier 2 "Layanan terlambat" (spec, Work Queues: "Tier 2: … Layanan Terlambat";
 * Tier 2 is the tier for "the Lokasi is not answering"). A job the Terlambat tick
 * flagged — its target date + 2 days with no proof of completion — is the
 * Operator's business as well as the Lokasi's: a family has paid, and a Terlambat
 * job is the one place a refund becomes a full one.
 *
 * The row is a plain projection of the Layanan module's own list of late jobs, so
 * it closes itself the moment the job is finished or cancelled, and nothing here
 * needs to change for it to disappear. The deadline is the day the work was due,
 * so the row reads as past its deadline the moment it is late.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { wib } from "@/lib/time/jakarta";

export const layananTerlambatRowType: AntreanRowType = {
  key: "layanan_terlambat_platform",
  tier: 2,
  label: "Layanan terlambat",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const terlambat = await deps.layanan.pekerjaanTerlambat();
    return terlambat.map((satu) => ({
      subjectKind: "pekerjaan_layanan",
      subjectId: satu.id,
      subjectLabel: `${satu.lokasi.name} · ${satu.pesanan} · ${satu.petak}`,
      href: `/staf/admin-lokasi/${satu.lokasi.id}/pekerjaan/${satu.id}`,
      deadline: wib(`${satu.targetDate} 23:59`),
    }));
  },
};
