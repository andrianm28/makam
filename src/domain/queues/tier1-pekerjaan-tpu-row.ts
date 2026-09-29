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
 * **Their deadline is the end of the day the work is due (23:59 WIB)**, the same as
 * the Terlambat row: the spec gives these rows no window of their own, so the one
 * moment the job's own date provides is used and the row reads as past its deadline
 * only once that day is over. A shorter window is the owner's call (recorded in ticket
 * 56's Comments), and the Tier 1 alert and escalation clock is ticket 28's.
 */
import { wib } from "@/lib/time/jakarta";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";

/** Where Admin Platform assigns one TPU job: the picker and the assignment history. */
export const pekerjaanTpuHref = (pekerjaanId: string) => `/staf/admin-platform/pekerjaan-tpu/${pekerjaanId}`;

const label = (satu: { nomor: string; label: string; tpuName: string }) => `${satu.nomor} · ${satu.label} · ${satu.tpuName}`;
const batas = (targetDate: string) => wib(`${targetDate} 23:59`);

/** Tier 1: a job due today (or already past its date) with no Mitra Jasa who has accepted it. */
export const pekerjaanTpuTanpaMitraRowType: AntreanRowType = {
  key: "pekerjaan_tpu_tanpa_mitra",
  tier: 1,
  label: "Pekerjaan hari ini tanpa Mitra Jasa",
  async rows(deps: AntreanRowDeps): Promise<RawAntreanRow[]> {
    const jobs = await deps.layanan.pekerjaanTpuHariIniTanpaMitra();
    return jobs.map((satu) => ({
      subjectKind: "pekerjaan_layanan_tpu",
      subjectId: satu.id,
      subjectLabel: label(satu),
      href: pekerjaanTpuHref(satu.id),
      deadline: batas(satu.targetDate),
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
