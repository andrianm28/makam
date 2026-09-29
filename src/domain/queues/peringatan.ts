/**
 * Tier 1 alerts and their escalation (spec, Work Queues and Notifications;
 * ticket 28, ADR 0004). The Antrean's rows are projections, so an alert is
 * driven from database state by a tick, never from the event that opened a row:
 *
 * - a new Tier 1 row alerts the Bertugas Admin Platform, every Admin Platform when
 *   nobody is Bertugas;
 * - not taken (Ambil) 30 min after that first alert, every Admin Platform is alerted;
 * - a row type that says so (Konfirmasi TPU Saat Duka, `eskalasiLanjutMenit`) alerts
 *   every Admin Platform once more 90 min after the first alert while it is open;
 * - a row of a TPU subject first seen outside 06:00–18:00 WIB waits for 06:00
 *   (`tundaMalam`);
 * - Tier 2 rows show without an alert, Tier 3 and 4 never alert: only the Tier 1
 *   row types are read here.
 *
 * Every stage is claimed with one conditional UPDATE before it is sent, so a tick
 * run twice, or by two workers, alerts once. An alert that fails to send is never
 * retried (Peringatan Staf are not), but a claim whose send threw is given back.
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
import type { RawAntreanRow, Tier1RowDeps, Tier1RowType } from "./row-types";
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

interface BarisTier1 extends RawAntreanRow {
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

export interface PeringatanTickResult {
  /** Peringatan Staf sent this run, first alerts and escalations together. */
  dikirim: number;
}

/** The worker's tick: see the file's header. Idempotent. */
export async function peringatanTier1Tick(deps: PeringatanDeps, now: Date): Promise<PeringatanTickResult> {
  const { db } = deps;
  const baris = await barisTier1Terbuka(deps);
  const kunci = baris.map((row) => row.rowKey);

  // A row that closed is forgotten, so nothing is left to age.
  await db.delete(antreanPeringatan).where(kunci.length > 0 ? notInArray(antreanPeringatan.rowKey, kunci) : undefined);
  if (baris.length === 0) return { dikirim: 0 };

  await db
    .insert(antreanPeringatan)
    .values(baris.map((row) => ({ rowKey: row.rowKey, terlihatAt: now, pertamaJatuhTempoAt: row.type.tundaMalam ? mulaiSiangBerikut(now) : now })))
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

  let dikirim = 0;
  const kirim = async (
    row: BarisTier1,
    kolom: "pertamaAt" | "eskalasi30At" | "eskalasi90At",
    tahap: "baru" | "eskalasi_30" | "eskalasi_90",
    penerima: () => Promise<{ accountId: string }[]>,
    syarat: ReturnType<typeof isNull>,
  ) => {
    const klaim = await db
      .update(antreanPeringatan)
      .set({ [kolom]: now })
      .where(and(eq(antreanPeringatan.rowKey, row.rowKey), syarat))
      .returning({ rowKey: antreanPeringatan.rowKey });
    if (klaim.length === 0) return; // another run has it
    try {
      const hasil = await deps.notifications.peringatanAntreanTier1({
        to: await penerima(),
        tahap,
        row: { label: row.type.label, subjectLabel: row.subjectLabel, href: row.href },
      });
      dikirim += hasil.dikirim;
    } catch (error) {
      await db.update(antreanPeringatan).set({ [kolom]: null }).where(eq(antreanPeringatan.rowKey, row.rowKey));
      throw error;
    }
  };

  for (const row of baris) {
    const state = stateByKey.get(row.rowKey);
    if (!state) continue;
    let pertamaAt = state.pertamaAt;
    if (!pertamaAt && state.pertamaJatuhTempoAt.getTime() <= now.getTime()) {
      await kirim(row, "pertamaAt", "baru", pertama, isNull(antreanPeringatan.pertamaAt));
      pertamaAt = now;
    }
    if (!pertamaAt) continue;
    if (!state.eskalasi30At && !sudahDiambil.has(row.rowKey) && now.getTime() - pertamaAt.getTime() >= ESKALASI_TIDAK_DIAMBIL_MENIT * MINUTE_MS) {
      await kirim(row, "eskalasi30At", "eskalasi_30", semuaAdmin, isNull(antreanPeringatan.eskalasi30At));
    }
    const lanjut = row.type.eskalasiLanjutMenit;
    if (lanjut && !state.eskalasi90At && now.getTime() - pertamaAt.getTime() >= lanjut * MINUTE_MS) {
      await kirim(row, "eskalasi90At", "eskalasi_90", semuaAdmin, isNull(antreanPeringatan.eskalasi90At));
    }
  }
  return { dikirim };
}
