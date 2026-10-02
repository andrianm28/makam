/**
 * Tier 2 "foto bukti" (spec, Work Queues: "Tier 2: foto bukti approval (24 h)"; ticket 57).
 * A TPU job whose Mitra Jasa sent the proof waits for Admin Platform to approve or reject it.
 * A plain projection of the Layanan module's own list of jobs Menunggu Verifikasi, so the
 * row closes itself the moment the job is approved or rejected. Its deadline is 24 hours
 * after the proof was sent.
 */
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { pekerjaanTpuHref } from "./tier1-pekerjaan-tpu-row";

export const buktiTpuRowType: AntreanRowType = {
  key: "bukti_tpu_verifikasi",
  tier: 2,
  label: "Foto bukti perlu disetujui",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const jobs = await deps.layanan.pekerjaanTpuMenungguVerifikasi();
    return jobs.map((satu) => ({
      subjectKind: "pekerjaan_layanan_tpu",
      subjectId: satu.id,
      subjectLabel: `${satu.nomor} · ${satu.label} · ${satu.tpuName}`,
      href: pekerjaanTpuHref(satu.id),
      deadline: satu.batasVerifikasi,
    }));
  },
};
