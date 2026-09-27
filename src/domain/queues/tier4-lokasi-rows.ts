/**
 * The two Tier 4 row types that follow one Lokasi Mitra revisit (spec, Work
 * Queues; ticket 17, "the Tier 4 revisit trigger" and its comment of
 * 2026-09-25): both exist only after Admin Platform presses "Minta kunjungan
 * ulang" on a Lokasi Mitra that is already published (not Belum Tayang), which
 * creates its Kunjungan Verifikasi Tugas Lapangan (ticket 15). Neither ever
 * opens for the onboarding visit, because that one completes (and stays open)
 * only while the Lokasi is still Belum Tayang, which both rows exclude.
 *
 * "Minta kunjungan ulang" (`minta-kunjungan-ulang-form.tsx`) is not itself a
 * distinct domain action: its button and the general "Buat Tugas Lapangan"
 * form both submit to the same Server Action, `buatTugasLapangan`, which
 * calls this same `fieldwork.createTugasLapangan`. So there is no "requested
 * by that button" flag to read; a Lokasi's publish status is what tells one
 * Kunjungan Verifikasi from another, and it is enough (verified by the tests
 * in `queues.test.ts`, "Tier 4 Lokasi kunjungan ulang and syarat tayang
 * ulang": a Kunjungan Verifikasi made with the general form's own field shape
 * opens the same row as one made with the button's).
 */
import { addWibDays } from "@/lib/time/jakarta";
import type { AntreanRowDeps, AntreanRowType, RawAntreanRow } from "./row-types";
import { fetchTugasAndLokasi, overdueFrom } from "./tier4-shared";

const lokasiHref = (lokasiId: string) => `/staf/admin-platform/lokasi/${lokasiId}`;

/**
 * Open while a Kunjungan Verifikasi Tugas Lapangan requested by "Minta
 * kunjungan ulang" is not yet Selesai (spec, Work Queues; ticket 17): any open
 * (Ditugaskan) Kunjungan Verifikasi for a Lokasi Mitra that is not Belum
 * Tayang, since during onboarding the Lokasi is Belum Tayang for as long as
 * its first Kunjungan Verifikasi stays open.
 */
export const lokasiRevisitRowType: AntreanRowType = {
  key: "lokasi_kunjungan_ulang",
  tier: 4,
  label: "Kunjungan ulang Lokasi",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const { tugas, lokasiById } = await fetchTugasAndLokasi(deps, by);
    const rows: RawAntreanRow[] = [];
    for (const item of tugas) {
      if (item.type !== "kunjungan_verifikasi" || item.status !== "ditugaskan" || !item.lokasiId) continue;
      const lokasi = lokasiById.get(item.lokasiId);
      if (!lokasi || lokasi.status === "belum_tayang") continue;
      rows.push({
        subjectKind: "lokasi_mitra",
        subjectId: item.lokasiId,
        subjectLabel: lokasi.name,
        href: lokasiHref(item.lokasiId),
        deadline: overdueFrom(item.plannedDate),
      });
    }
    return rows;
  },
};

/**
 * How long Admin Platform has, after a revisit's Kunjungan Verifikasi
 * completes, to confirm the Lokasi still meets the publish gate before this
 * row is marked past its deadline. Spec (Work Queues) gives this row no SLA
 * of its own; a week is this ticket's choice, in line with its Tier 4
 * neighbours' single-digit-day windows (e.g. the 14-day stale TPU flag).
 */
const PUBLISH_GATE_RECHECK_GRACE_DAYS = 7;

/**
 * Open from a revisit's Kunjungan Verifikasi Selesai until Admin Platform
 * records that the Lokasi still meets the publish gate (spec, Work Queues;
 * ticket 17): the Lokasi's latest completed Kunjungan Verifikasi after it was
 * first published, compared with its last "masih memenuhi syarat tayang"
 * confirmation (`lokasi.recordPublishGateMasihTerpenuhi`). The Lokasi's own
 * publish moment (`publishedAt`) is what keeps the initial onboarding visit
 * from ever opening this row.
 */
export const publishGateCheckRowType: AntreanRowType = {
  key: "lokasi_syarat_tayang_ulang",
  tier: 4,
  label: "Cek ulang syarat tayang",
  async rows(deps: AntreanRowDeps, by): Promise<RawAntreanRow[]> {
    const { tugas, lokasiMitra } = await fetchTugasAndLokasi(deps, by);
    const latestRevisitCompletionByLokasi = new Map<string, Date>();
    for (const item of tugas) {
      if (item.type !== "kunjungan_verifikasi" || item.status !== "selesai" || !item.lokasiId || !item.completedAt) continue;
      const current = latestRevisitCompletionByLokasi.get(item.lokasiId);
      if (!current || item.completedAt > current) latestRevisitCompletionByLokasi.set(item.lokasiId, item.completedAt);
    }
    const rows: RawAntreanRow[] = [];
    for (const lokasi of lokasiMitra) {
      if (lokasi.status === "belum_tayang" || !lokasi.publishedAt) continue;
      const latestCompletedAt = latestRevisitCompletionByLokasi.get(lokasi.id);
      if (!latestCompletedAt || latestCompletedAt <= lokasi.publishedAt) continue;
      if (lokasi.publishGateRecheckedAt && lokasi.publishGateRecheckedAt >= latestCompletedAt) continue;
      rows.push({
        subjectKind: "lokasi_mitra",
        subjectId: lokasi.id,
        subjectLabel: lokasi.name,
        href: lokasiHref(lokasi.id),
        deadline: addWibDays(latestCompletedAt, PUBLISH_GATE_RECHECK_GRACE_DAYS),
      });
    }
    return rows;
  },
};
