import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Lokasi } from "@/domain/lokasi";
import { createLayanan, type Layanan, type LayananDeps, type PekerjaanMitraJasaPort } from "@/domain/layanan";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";

/**
 * The `web` and `worker` composition of the Layanan module: the catalog, the
 * prices, the Paket Layanan and the Mitra Jasa.
 *
 * `pekerjaan` is the one port this module reaches sideways for, and it is the
 * one piece a later ticket owns: the rows that say "one job one Mitra Jasa holds"
 * belong to whoever creates jobs (ticket 50 for a Lokasi Mitra, 56 for a TPU).
 * Until one of them exists there are no jobs at all, so the stand-in below is not
 * a stub of a working thing — it is what that state actually looks like: no job,
 * so no scorecard number, no "Baru" badge ending, and nothing to release on a
 * suspension. It is replaced in the composition root the moment the job module
 * lands; nothing else in this file has to change.
 */
export function composeLayanan(deps: {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  files: FileStore;
  lokasi: Pick<Lokasi, "lokasiMitra" | "isTerverifikasi">;
  tariffs: Pick<LayananDeps["tariffs"], "quote" | "hargaLayananLokasi" | "hargaLayananLokasiSemua" | "within">;
}): Layanan {
  // The stand-in is wired here and nowhere else: tickets 50 (a Lokasi Mitra's jobs) and 56 (a TPU's) replace it with the real job read.
  return createLayanan({ ...deps, pekerjaan: belumAdaPekerjaan() });
}

/** The job port as it stands before any job exists: nothing to list, nothing to release. */
function belumAdaPekerjaan(): PekerjaanMitraJasaPort {
  const port: PekerjaanMitraJasaPort = {
    async daftarPekerjaan() {
      return [];
    },
    async jumlahSelesai(ids) {
      return Object.fromEntries(ids.map((id) => [id, 0]));
    },
    async lepasPekerjaan() {
      return { ok: false, reason: "tidak_ditemukan" };
    },
    within() {
      return port;
    },
  };
  return port;
}
