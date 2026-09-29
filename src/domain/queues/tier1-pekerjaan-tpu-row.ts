/**
 * The Antrean's rows for a TPU job that needs a Mitra Jasa (spec, Work Queues:
 * "Tier 1: … jobs due today without a Mitra Jasa" and "Tier 2: … jobs Tidak
 * direspons / Ditolak / flagged for reassignment"; stories 156 and 176; ticket 56).
 *
 * Both are plain projections of the Layanan module's own reads, so they close by
 * state alone: a Tier 1 row the moment a Mitra Jasa accepts (or the job is done or
 * cancelled), a Tier 2 row the moment Admin Platform assigns the job again. Nobody
 * creates them by hand.
 *
 * The Tier 1 row is a ticket 28 `Tier1RowType`: it alerts, and its clocks count from
 * `sejak`, when the row appeared (the job's own day starting, its being scheduled or its
 * last assignment ending, whichever is latest). It has no deadline of its own, and it is
 * open only while **no Mitra Jasa is assigned**: a job whose Mitra Jasa is still inside
 * the accept deadline is not Tier 1. The Tier 2 rows are due at the end of the day the
 * work is due (23:59 WIB), as the Terlambat row is.
 */
import { wib } from "@/lib/time/jakarta";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow, Tier1Row, Tier1RowDeps, Tier1RowType } from "./row-types";

/** Where Admin Platform assigns one TPU job: the picker and the assignment history. */
export const pekerjaanTpuHref = (pekerjaanId: string) => `/staf/admin-platform/pekerjaan-tpu/${pekerjaanId}`;

const label = (satu: { nomor: string; label: string; tpuName: string }) => `${satu.nomor} · ${satu.label} · ${satu.tpuName}`;
const batas = (targetDate: string) => wib(`${targetDate} 23:59`);

/** Tier 1: a job due today (or already past its date) with no Mitra Jasa assigned. */
export const pekerjaanTpuTanpaMitraRowType: Tier1RowType = {
  key: "pekerjaan_tpu_tanpa_mitra",
  tier: 1,
  label: "Pekerjaan hari ini tanpa Mitra Jasa",
  async rows(deps: Tier1RowDeps): Promise<Tier1Row[]> {
    const jobs = await deps.layanan.pekerjaanTpuHariIniTanpaMitra();
    return jobs.map((satu) => ({
      subjectKind: "pekerjaan_layanan_tpu",
      subjectId: satu.id,
      subjectLabel: label(satu),
      href: pekerjaanTpuHref(satu.id),
      deadline: null,
      sejak: satu.sejak,
    }));
  },
};

/** One Tier 2 row type: the jobs whose last assignment ended for this reason. */
function perluTindakan(alasan: "tidak_direspons" | "ditolak" | "dilepas", key: string, judul: string): AntreanRowType {
  return {
    key,
    tier: 2,
    label: judul,
    async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
      const jobs = await deps.layanan.pekerjaanTpuPerluTindakan();
      return jobs
        .filter((satu) => satu.alasan === alasan)
        .map((satu) => ({
          subjectKind: "pekerjaan_layanan_tpu",
          subjectId: satu.id,
          subjectLabel: label(satu),
          href: pekerjaanTpuHref(satu.id),
          deadline: batas(satu.targetDate),
        }));
    },
  };
}

/** Tier 2: the Mitra Jasa did not answer by the accept deadline. */
export const pekerjaanTpuTidakDiresponsRowType = perluTindakan("tidak_direspons", "pekerjaan_tpu_tidak_direspons", "Pekerjaan TPU tidak direspons");
/** Tier 2: the Mitra Jasa declined. */
export const pekerjaanTpuDitolakRowType = perluTindakan("ditolak", "pekerjaan_tpu_ditolak", "Pekerjaan TPU ditolak Mitra Jasa");
/** Tier 2: flagged for reassignment (released by Admin Platform, or by a Mitra Jasa's suspension or ending). */
export const pekerjaanTpuPenugasanUlangRowType = perluTindakan("dilepas", "pekerjaan_tpu_penugasan_ulang", "Pekerjaan TPU perlu penugasan ulang");
