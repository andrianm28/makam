/**
 * Tier 1 alerts and their escalation (spec, Work Queues and Notifications;
 * ticket 28, ADR 0004). The Antrean's rows are projections, so an alert is
 * driven from database state by a tick, never from the event that opened a row.
 *
 * Every clock counts from the row's own anchor (`Tier1Row.sejak`: when the row
 * appeared, a fact its subject already carries), never from the tick's first sight
 * of it (owner decision 2026-09-29), so a late tick still escalates on time:
 *
 * - a new Tier 1 row alerts the Bertugas Admin Platform, every Admin Platform when
 *   nobody is Bertugas;
 * - not taken (Ambil) 30 min after that anchor, every Admin Platform is alerted;
 * - a row type that says so (Konfirmasi TPU Saat Duka, `eskalasiLanjutMenit`) alerts
 *   every Admin Platform once more 90 min after the anchor while it is open;
 * - a row of a TPU subject that appeared outside 06:00-18:00 WIB is held to 06:00
 *   (`tundaMalam`), and its 30 and 90 min count from that 06:00;
 * - Tier 2 rows show without an alert, Tier 3 and 4 never alert: only the Tier 1
 *   row types are read here.
 *
 * Each stage is claimed by one conditional UPDATE and its alerts are queued through
 * Notifications in the same transaction, so a stage is claimed if and only if its
 * alert is queued, a tick run twice (or by two workers) alerts once, and a crash
 * after the commit loses nothing: Notifications' own tick sends what is queued.
 *
 * There is no call row for an alert nobody answers (settled 2026-09-26): the banner
 * (`tier1BelumDiambil`) in the header of every staff page is what remains visible.
 */
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import type { Database } from "@/db/client";
import { antreanResource, writeRefusal, type Actor, type Identity } from "@/domain/identity";
import type { Notifications } from "@/domain/notifications";
import { addWibDays, wibDayStart } from "@/lib/time/jakarta";
import { rowKeyOf } from "./antrean";
import { bertugasSekarang } from "./bertugas";
import { tier1RowTypes } from "./registry";
import type { Tier1Row, Tier1RowDeps, Tier1RowType } from "./row-types";
import { antreanAmbil, antreanPeringatan } from "./schema";

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

/** Not taken within this many minutes of the first alert, every Admin Platform is alerted. */
export const ESKALASI_TIDAK_DIAMBIL_MENIT = 30;
/** The window in which a TPU row alerts as it appears; outside it, it waits for the window to open. */
const SIANG_BUKA_JAM = 6;
const SIANG_TUTUP_JAM = 18;

export interface PeringatanDeps extends Tier1RowDeps {
  db: Database;
  /** Who is an Admin Platform (and not Dinonaktifkan): the everyone of "everyone if none is Bertugas". */
  identity: Pick<Identity, "staffAccounts">;
  notifications: Pick<Notifications, "peringatanAntreanTier1" | "teleponPemesanTerbuka" | "teleponPemesanTercatat">;
}

/** The moment a TPU row seen at `now` is first alerted: now within 06:00–18:00 WIB, else the next 06:00. */
export function mulaiSiangBerikut(now: Date): Date {
  const buka = new Date(wibDayStart(now).getTime() + SIANG_BUKA_JAM * HOUR_MS);
  const tutup = new Date(wibDayStart(now).getTime() + SIANG_TUTUP_JAM * HOUR_MS);
  if (now.getTime() >= buka.getTime() && now.getTime() < tutup.getTime()) return now;
  return now.getTime() < buka.getTime() ? buka : addWibDays(buka, 1);
}

interface BarisTier1 extends Tier1Row {
  rowKey: string;
  type: Tier1RowType;
}

/** Every open Tier 1 row, from each Tier 1 type's own query. */
async function barisTier1Terbuka(deps: Tier1RowDeps): Promise<BarisTier1[]> {
  const perTipe = await Promise.all(
    tier1RowTypes.map(async (type) => (await type.rows(deps)).map((row) => ({ ...row, type, rowKey: rowKeyOf(type.key, row.subjectId) }))),
  );
  return perTipe.flat();
}

/** How many Tier 1 rows nobody has taken (Ambil): what the red banner in the staff header counts; Admin Platform only. */
export async function tier1BelumDiambil(deps: Tier1RowDeps & { db: Database }, by: Actor): Promise<number> {
  if (writeRefusal(by, "antrean.lihat", antreanResource())) return 0;
  const baris = await barisTier1Terbuka(deps);
  if (baris.length === 0) return 0;
  const diambil = await deps.db
    .select({ rowKey: antreanAmbil.rowKey })
    .from(antreanAmbil)
    .where(inArray(antreanAmbil.rowKey, baris.map((row) => row.rowKey)));
  const kunci = new Set(diambil.map((row) => row.rowKey));
  return baris.filter((row) => !kunci.has(row.rowKey)).length;
}

/** Whether a Tier 1 row is still open and nobody has taken it (Ambil): what a retried escalation asks before it is sent again. */
export async function barisMasihTerbukaBelumDiambil(deps: Tier1RowDeps & { db: Database }, rowKey: string): Promise<boolean> {
  const terbuka = (await barisTier1Terbuka(deps)).some((row) => row.rowKey === rowKey);
  if (!terbuka) return false;
  const [diambil] = await deps.db.select({ rowKey: antreanAmbil.rowKey }).from(antreanAmbil).where(eq(antreanAmbil.rowKey, rowKey));
  return !diambil;
}

/** Whether a Tier 1 row is still open, taken or not: what a retried 90 min escalation asks before it is sent again (ticket 96). */
export async function barisMasihTerbuka(deps: Tier1RowDeps, rowKey: string): Promise<boolean> {
  return (await barisTier1Terbuka(deps)).some((row) => row.rowKey === rowKey);
}

export interface PeringatanTickResult {
  /** Peringatan Staf queued this run (one per recipient), first alerts and escalations together; Notifications' tick sends them. */
  diantrekan: number;
}

/**
 * The worker's tick: see the file's header. Idempotent. A tick that comes late still
 * escalates on time: the clocks count from the row's own `sejak`, so a first tick 40 min
 * after a row appeared queues the first alert and the 30 min escalation together (first alert first).
 */
export async function peringatanTier1Tick(deps: PeringatanDeps, now: Date): Promise<PeringatanTickResult> {
  const { db } = deps;
  const baris = await barisTier1Terbuka(deps);
  const kunci = baris.map((row) => row.rowKey);

  // A row that closed is forgotten, so nothing is left to age.
  await db.delete(antreanPeringatan).where(kunci.length > 0 ? notInArray(antreanPeringatan.rowKey, kunci) : undefined);
  if (baris.length === 0) return { diantrekan: 0 };

  // Every clock counts from the row's own anchor (`sejak`), never from this first sight of it.
  await db
    .insert(antreanPeringatan)
    .values(
      baris.map((row) => ({
        rowKey: row.rowKey,
        terlihatAt: now,
        pertamaJatuhTempoAt: row.type.tundaMalam ? mulaiSiangBerikut(row.sejak) : row.sejak,
      })),
    )
    .onConflictDoNothing();

  const [keadaan, diambil] = await Promise.all([
    db.select().from(antreanPeringatan).where(inArray(antreanPeringatan.rowKey, kunci)),
    db.select({ rowKey: antreanAmbil.rowKey }).from(antreanAmbil).where(inArray(antreanAmbil.rowKey, kunci)),
  ]);
  const stateByKey = new Map(keadaan.map((row) => [row.rowKey, row]));
  const sudahDiambil = new Set(diambil.map((row) => row.rowKey));

  const semuaAdmin = async () =>
    (await deps.identity.staffAccounts()).filter((akun) => akun.roles.includes("admin_platform") && !akun.deactivated).map((akun) => ({ accountId: akun.accountId }));
  let penerimaPertama: { accountId: string }[] | undefined;
  const pertama = async () => {
    if (penerimaPertama) return penerimaPertama;
    const bertugas = await bertugasSekarang(deps, now);
    penerimaPertama = bertugas.length > 0 ? bertugas.map((akun) => ({ accountId: akun.accountId })) : await semuaAdmin();
    return penerimaPertama;
  };

  let diantrekan = 0;
  /** Claims one stage and queues its alert in the same transaction: both happen, or neither. */
  const antrekan = async (
    row: BarisTier1,
    kolom: "pertamaAt" | "eskalasi30At" | "eskalasi90At",
    tahap: "baru" | "eskalasi_30" | "eskalasi_90",
    penerima: () => Promise<{ accountId: string }[]>,
    syarat: ReturnType<typeof isNull>,
  ) => {
    diantrekan += await db.transaction(async (tx) => {
      const klaim = await tx
        .update(antreanPeringatan)
        .set({ [kolom]: now })
        .where(and(eq(antreanPeringatan.rowKey, row.rowKey), syarat))
        .returning({ rowKey: antreanPeringatan.rowKey });
      if (klaim.length === 0) return 0; // another run has it
      const hasil = await deps.notifications.peringatanAntreanTier1(
        { to: await penerima(), tahap, row: { label: row.type.label, subjectLabel: row.subjectLabel, href: row.href, key: row.rowKey } },
        tx,
      );
      return hasil.diantrekan;
    });
  };

  for (const row of baris) {
    const state = stateByKey.get(row.rowKey);
    if (!state) continue;
    const anchor = state.pertamaJatuhTempoAt.getTime();
    if (!state.pertamaAt) {
      if (anchor > now.getTime()) continue; // the first alert is not due yet (a night TPU row waiting for 06:00)
      await antrekan(row, "pertamaAt", "baru", pertama, isNull(antreanPeringatan.pertamaAt));
    }
    if (!state.eskalasi30At && !sudahDiambil.has(row.rowKey) && now.getTime() - anchor >= ESKALASI_TIDAK_DIAMBIL_MENIT * MINUTE_MS) {
      await antrekan(row, "eskalasi30At", "eskalasi_30", semuaAdmin, isNull(antreanPeringatan.eskalasi30At));
    }
    const lanjut = row.type.eskalasiLanjutMenit;
    if (lanjut && !state.eskalasi90At && now.getTime() - anchor >= lanjut * MINUTE_MS) {
      await antrekan(row, "eskalasi90At", "eskalasi_90", semuaAdmin, isNull(antreanPeringatan.eskalasi90At));
    }
  }
  return { diantrekan };
}
