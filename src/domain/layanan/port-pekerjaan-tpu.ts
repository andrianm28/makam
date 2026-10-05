/**
 * The job port the Mitra Jasa scorecard and a suspension reach for (ticket 55),
 * implemented over the TPU job tables this module owns (ticket 56).
 *
 * A Mitra Jasa's "jobs" are their **assignments**: one row per time a job was handed
 * to them, so a decline, a "Tidak direspons" and a release are each counted for the
 * person who was handed the job even after it goes to somebody else. The id a listed
 * job carries is therefore its assignment's id, and `lepasPekerjaan` takes that same id.
 *
 * The port stays dull, as ticket 55 wrote it: it lists, counts and releases. Which
 * jobs a suspension takes off and which count inside the 90-day window are that
 * ticket's rules, applied to what this returns.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";
import type { PekerjaanMitraJasa, PekerjaanMitraJasaPort } from "./deps";
import { pekerjaanLayananTpu, pekerjaanLayananTpuPenugasan, penilaianLayananTpu, type PekerjaanTpuStatus, type PenugasanHasil } from "./schema";

/** How a job status is worded for the scorecard while the Mitra Jasa still holds the job. */
function statusDipegang(status: PekerjaanTpuStatus): PekerjaanMitraJasa["status"] {
  switch (status) {
    case "menunggu_pembayaran":
    case "dijadwalkan":
      return "dijadwalkan";
    case "selesai":
      return "selesai";
    case "dibatalkan":
      return "dibatalkan";
    case "sedang_dikerjakan":
    case "menunggu_verifikasi":
    case "terlambat":
    case "keluhan":
      return "dikerjakan";
  }
}

/** A finished assignment (declined, unanswered, released) is a job this Mitra Jasa no longer holds. */
function sudahBerakhir(hasil: PenugasanHasil): boolean {
  return hasil === "ditolak" || hasil === "tidak_direspons" || hasil === "dilepas";
}

export function portPekerjaanTpu(db: Database, clock: Clock): PekerjaanMitraJasaPort {
  const port: PekerjaanMitraJasaPort = {
    async daftarPekerjaan(mitraJasaId) {
      const rows = await db
        .select({ penugasan: pekerjaanLayananTpuPenugasan, job: pekerjaanLayananTpu, bintang: penilaianLayananTpu.bintang })
        .from(pekerjaanLayananTpuPenugasan)
        .innerJoin(pekerjaanLayananTpu, eq(pekerjaanLayananTpu.id, pekerjaanLayananTpuPenugasan.pekerjaanId))
        .leftJoin(penilaianLayananTpu, eq(penilaianLayananTpu.pekerjaanId, pekerjaanLayananTpu.id))
        .where(eq(pekerjaanLayananTpuPenugasan.mitraJasaId, mitraJasaId))
        .orderBy(asc(pekerjaanLayananTpuPenugasan.ditugaskanAt), asc(pekerjaanLayananTpuPenugasan.id));
      return rows.map(({ penugasan, job, bintang }): PekerjaanMitraJasa => {
        const berakhir = sudahBerakhir(penugasan.hasil);
        // A job Admin Platform approved is counted when it was finished, for the Mitra Jasa who still holds it (the assignment they accepted).
        const selesai = !berakhir && job.status === "selesai" && job.selesaiAt !== null;
        return {
          id: penugasan.id,
          status: berakhir ? "dibatalkan" : statusDipegang(job.status),
          targetDate: job.targetDate,
          // A decline is counted when it happened and a finished job when it was finished. Terlambat and Keluhan upheld of a TPU job are not fed yet.
          dihitungPada: berakhir ? penugasan.dijawabAt : selesai ? job.selesaiAt : null,
          terlambat: !berakhir && job.status === "terlambat",
          keluhanUpheld: false,
          ditolak: penugasan.hasil === "ditolak",
          tidakDirespons: penugasan.hasil === "tidak_direspons",
          // The family's stars belong to the job's one Mitra Jasa, never to one it was taken off or who declined it.
          penilaian: berakhir ? null : bintang,
        };
      });
    },

    async jumlahSelesai(ids) {
      const hasil: Record<string, number> = Object.fromEntries(ids.map((id) => [id, 0]));
      if (ids.length === 0) return hasil;
      const rows = await db
        .select({ mitraJasaId: pekerjaanLayananTpuPenugasan.mitraJasaId })
        .from(pekerjaanLayananTpuPenugasan)
        .innerJoin(pekerjaanLayananTpu, eq(pekerjaanLayananTpu.id, pekerjaanLayananTpuPenugasan.pekerjaanId))
        .where(
          and(
            inArray(pekerjaanLayananTpuPenugasan.mitraJasaId, ids),
            eq(pekerjaanLayananTpuPenugasan.hasil, "diterima"),
            eq(pekerjaanLayananTpu.status, "selesai"),
          ),
        );
      for (const row of rows) hasil[row.mitraJasaId] = (hasil[row.mitraJasaId] ?? 0) + 1;
      return hasil;
    },

    async lepasPekerjaan({ pekerjaanId, alasan }) {
      // The id is an assignment's. Only one that still holds a job which has not started can be taken off.
      const [terbuka] = await db
        .select({ id: pekerjaanLayananTpuPenugasan.id })
        .from(pekerjaanLayananTpuPenugasan)
        .innerJoin(pekerjaanLayananTpu, eq(pekerjaanLayananTpu.id, pekerjaanLayananTpuPenugasan.pekerjaanId))
        .where(
          and(
            eq(pekerjaanLayananTpuPenugasan.id, pekerjaanId),
            inArray(pekerjaanLayananTpuPenugasan.hasil, ["menunggu", "diterima"]),
            eq(pekerjaanLayananTpu.status, "dijadwalkan"),
          ),
        );
      if (!terbuka) return { ok: false, reason: "tidak_ditemukan" };
      await db
        .update(pekerjaanLayananTpuPenugasan)
        .set({ hasil: "dilepas", dijawabAt: clock.now(), alasan })
        .where(eq(pekerjaanLayananTpuPenugasan.id, terbuka.id));
      return { ok: true };
    },

    within(tx) {
      return portPekerjaanTpu(tx, clock);
    },
  };
  return port;
}
