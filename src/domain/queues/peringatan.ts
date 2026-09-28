/**
 * The Tier 1 Antrean's Peringatan Staf and its escalations (spec, Work Queues:
 * "a red banner shows in the header of every staff page while any Tier 1 row is
 * untaken (no call row: the platform cannot place calls, and whoever missed the
 * push and email would miss the row too; decided 2026-09-26). Night TPU rows
 * alert at 06:00. Tier 3–4 rows never alert."; ticket 28).
 *
 * A worker tick, not a queue: a row is a projection and is never stored, so
 * `antrean_peringatan`'s row for a (row, stage) pair is the only trace its alerts
 * leave, and the insert of that pair is the claim. A stage already there is never
 * sent again, which is what makes the tick idempotent — a second run at the same
 * `now`, or two workers at once, send nothing the first did not.
 *
 * **Who is told what.** A new row goes to whoever is Bertugas at that moment, and
 * to every Admin Platform when nobody is (CONTEXT.md: Bertugas is possible only
 * with an active Perangkat Push, so a duty always has a browser to reach). An
 * escalation always goes to every Admin Platform, whoever is on duty: a row that
 * has gone 30 minutes untaken is not one person's problem.
 *
 * **When.** A row is announced when it appears — or at 06:00 WIB when a TPU row
 * appeared at night, so nobody is woken for a submission the platform handles in
 * the morning. The escalations are counted from that announcement, so a night row
 * is never escalated about a duty nobody had been told of yet. Both are
 * wall-clock instants taken from the Clock; neither is a *deadline*, and neither
 * waits for the 08:00–20:00 WIB reminder window, which is a delivery window for
 * family reminders and says nothing about a Peringatan Staf (which is
 * `transaksional`: a new Saat Duka order alerts every Admin Lokasi at night).
 */ import { isOpenAt, nextDaytimeStart, TPU_SCHEDULE } from "@/domain/lokasi";
import { stafAntreanAlert } from "@/lib/antrean-labels";
import { barisAntrian, rowKeyOf, type AntreanRow, type QueuesAntreanDeps } from "./antrean";
import { petugasBertugasIds } from "./bertugas";
import { antreanRowTypes } from "./registry";
import type { PeringatanAntrean } from "./row-types";
import { antreanPeringatan } from "./schema";

const MENIT = 60_000;

/** The stage of a row's own alert; each escalation is its own minutes after the announcement. */
export const TAHAP_UMUM = 0;

/** One Peringatan Staf this run sent. */
export interface PeringatanTerkirim {
  /** `${rowType}:${subjectId}`, as in Ambil, Catatan Internal and `antrean_peringatan`. */
  rowKey: string;
  /** 0 for the row's own alert; the minutes after the announcement for an escalation. */
  tahap: number;
  /** How many Akun Staf it reached. */
  penerima: number;
}

/** What one run of the alert tick did. */
export interface HasilPeringatanTick {
  /** Every Peringatan Staf sent, in the order it was sent. */
  dikirim: PeringatanTerkirim[];
}

/**
 * The instant a row is announced: when it appeared, or 06:00 WIB when a TPU row
 * appeared outside the 06:00–18:00 WIB window (spec: "Night TPU rows alert at
 * 06:00"). The window is the working-time calculator's own TPU schedule, read as
 * the window it is; a *message* window would be a delivery question, and a
 * reminder due at 05:00 is still a reminder due at 05:00.
 */
export function diumumkanPada(peringatan: PeringatanAntrean, dibukaPada: Date): Date {
  if (peringatan.tpu && !isOpenAt(TPU_SCHEDULE, dibukaPada)) return nextDaytimeStart(dibukaPada);
  return dibukaPada;
}

/** One alert a row owes: the row's own, and one per escalation its type declares. */
export interface TahapPeringatan {
  /** 0 for the row's own alert; the minutes after the announcement for an escalation. */
  tahap: number;
  /** The instant it falls due. */
  jatuhPada: Date;
}

/**
 * When every alert a row owes falls due: its own at the moment it is announced, and each escalation the
 * minutes after that. The whole schedule in one place, so a row type that declares two escalations (the
 * 30 and 90 minutes of Konfirmasi TPU Saat Duka, ticket 45) is not a special case anywhere.
 */
export function tahapPeringatan(peringatan: PeringatanAntrean, dibukaPada: Date): TahapPeringatan[] {
  const diumumkan = diumumkanPada(peringatan, dibukaPada).getTime();
  return [TAHAP_UMUM, ...peringatan.eskalasiMenit].map((tahap) => ({
    tahap,
    jatuhPada: new Date(diumumkan + tahap * MENIT),
  }));
}

/**
 * Scheduler tick: announces every open Tier 1 Antrean row not yet announced, and
 * re-alerts everyone about each one that has reached an escalation time still
 * untaken (Ambil). A row that is taken, or that closed with the state it read,
 * is never sent about again.
 *
 * Idempotent, as every tick is: each (row, stage) goes out once and only once.
 */
export async function tickPeringatanAntrean(deps: QueuesAntreanDeps, now: Date): Promise<HasilPeringatanTick> {
  const kosong: HasilPeringatanTick = { dikirim: [] };
  const baris = (await barisAntrian(deps)).filter(bisaDiberiPeringatan);
  if (baris.length === 0) return kosong;

  const [bertugasIds, adminPlatform] = await Promise.all([
    petugasBertugasIds(deps.db, now),
    deps.identity.adminPlatformOf(),
  ]);
  const semuaAdminPlatform = adminPlatform.map((akun) => akun.accountId);
  const dikirim: PeringatanTerkirim[] = [];

  for (const satu of baris) {
    const aturan = aturanDari(satu);
    if (!aturan || !satu.openedAt) continue;
    for (const { tahap, jatuhPada } of tahapPeringatan(aturan, satu.openedAt)) {
      if (jatuhPada > now) continue;
      const escalate = tahap !== TAHAP_UMUM;
      // A new row goes to whoever is Bertugas; an escalation goes to everyone,
      // whoever is on duty. Nobody on duty means everyone, once.
      const penerima = [...new Set(!escalate && bertugasIds.length > 0 ? bertugasIds : semuaAdminPlatform)];
      if (penerima.length === 0) continue;
      const rowKey = rowKeyOf(satu.type, satu.subjectId);
      // The claim, and the only thing that makes this tick idempotent.
      const diklaim = await deps.db
        .insert(antreanPeringatan)
        .values({ rowKey, tahap, dikirimPada: now })
        .onConflictDoNothing({
          target: [antreanPeringatan.rowKey, antreanPeringatan.tahap],
        })
        .returning({ rowKey: antreanPeringatan.rowKey });
      if (diklaim.length === 0) continue;
      const alert = stafAntreanAlert(satu, {
        escalated: escalate,
        menit: tahap,
      });
      for (const accountId of penerima) {
        await deps.notifications.sendStaffAlert({
          to: { accountId },
          kind: escalate ? "staf_antrean_eskalasi" : "staf_antrean_mendesak",
          ...alert,
        });
      }
      dikirim.push({ rowKey, tahap, penerima: penerima.length });
    }
  }
  return { dikirim };
}

/** The alerting rules of the row type this row came from, or null when the type never alerts. */
function aturanDari(baris: AntreanRow): PeringatanAntrean | null {
  return antreanRowTypes.find((rowType) => rowType.key === baris.type)?.peringatan ?? null;
}

/**
 * A row that can be told about: its type declares an alert, it said when it
 * appeared (an escalating alert needs that), and nobody has taken it (Ambil) —
 * a row already held is nobody's emergency.
 */
function bisaDiberiPeringatan(baris: AntreanRow): boolean {
  return baris.ambil === null && baris.openedAt !== null && aturanDari(baris) !== null;
}
