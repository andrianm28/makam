import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Lokasi } from "@/domain/lokasi";
import type { Tariffs } from "@/domain/tariffs";
import type { Clock } from "@/ports/clock";
import type { FileStore } from "@/ports/file-store";

/**
 * One job one Mitra Jasa holds or held, with the facts the scorecard counts and
 * the status effects act on (spec, Layanan > Mitra Jasa). The job row itself
 * belongs to the module that creates it (ticket 50 for a Lokasi Mitra, 56 for a
 * TPU), so this module asks for these facts and never reads that module's table.
 */
export interface PekerjaanMitraJasa {
  id: string;
  /** The job's own status, as the module that owns it words it. */
  status: "dijadwalkan" | "ditugaskan" | "dikerjakan" | "selesai" | "dibatalkan";
  /** The date the work is due on, as a WIB calendar date. */
  targetDate: string;
  /**
   * The moment this job is counted at, and the one the 90-day window is measured
   * from: when it was finished, declined, or never answered. Null while it is
   * still open, so a job nobody has answered yet counts for nothing yet.
   */
  dihitungPada: Date | null;
  /** Finished after its target date, or cancelled for lateness. */
  terlambat: boolean;
  /** Its Keluhan was upheld by Admin Platform. */
  keluhanUpheld: boolean;
  /** The Mitra Jasa declined it. */
  ditolak: boolean;
  /** The Mitra Jasa never answered the assignment. */
  tidakDirespons: boolean;
  /** The family's Penilaian 1–5, or null when none was given. */
  penilaian: number | null;
}

export type LepasPekerjaanResult = { ok: true } | { ok: false; reason: "tidak_ditemukan" };

/**
 * The narrow read and write this module needs from whoever owns the job rows.
 *
 * Deliberately dull: the *rules* stay here (which jobs a suspension takes off,
 * which ones count inside the 90-day window), and the port only stores and lists.
 * `within(tx)` is `tariffs.within(tx)`'s shape, so a status change and the jobs
 * it takes off commit together.
 */
export interface PekerjaanMitraJasaPort {
  /** Every job one Mitra Jasa holds or held, oldest first. */
  daftarPekerjaan(mitraJasaId: string): Promise<PekerjaanMitraJasa[]>;
  /** Takes one of that Mitra Jasa's jobs off them, with the reason, in the port's own words. */
  lepasPekerjaan(input: { pekerjaanId: string; alasan: string }): Promise<LepasPekerjaanResult>;
  /** The same two, bound to a caller's transaction. */
  within(tx: Database): PekerjaanMitraJasaPort;
}

export interface LayananDeps {
  db: Database;
  clock: Clock;
  /** Every catalog, offering and Paket write records an Entri Audit here. */
  audit: AuditLog;
  /** The private FileStore a Mitra Jasa's KTP photo, their photo and the signed arrangement scan land in. */
  files: Pick<FileStore, "put">;
  /** A Lokasi Mitra is looked up through the Lokasi module, never its table: by a staff actor, or whether it is listed. */
  lokasi: Pick<Lokasi, "lokasiMitra" | "isTerverifikasi">;
  /**
   * Every price of a Layanan variant is a versioned tariff: quoted here, read for
   * the screens, and written through the Tariffs module — `within(tx)` so an
   * offering and its price commit or roll back together.
   */
  tariffs: Pick<Tariffs, "quote" | "hargaLayananLokasi" | "hargaLayananLokasiSemua" | "within">;
  /** A Mitra Jasa's jobs: the scorecard's numbers and the ones a suspension takes off. */
  pekerjaan: PekerjaanMitraJasaPort;
}
