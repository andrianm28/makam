/**
 * A Mitra Jasa's 90-day scorecard, and the monthly review row it feeds
 * (spec, Layanan > Mitra Jasa > Profile, and Work Queues > Tier 4; story 159;
 * ticket 55).
 *
 * The window is the last 90 days ending at the Clock's now, and a job counts when
 * it happened: finished, declined, or never answered. A job whose moment is
 * *exactly* 90 days old is outside the window, one a day younger is inside, so the
 * boundary is stated as "later than 90 days ago" rather than left to a `<=`.
 *
 * The numbers come from the job port (`./deps.ts`), not from a table here: this
 * module counts and windows, the module that owns the jobs stores them. Nothing in
 * this file reads a grave, a family, a document or the Audit Log — a scorecard is
 * five numbers, and that is all a Mitra Jasa or a review may see.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor, WriteRefusal } from "@/domain/identity";
import { writeRefusal } from "@/domain/identity";
import { addWibDays, wibDateOf } from "@/lib/time/jakarta";
import type { LayananDeps, PekerjaanMitraJasa } from "./deps";
import { layananMitraJasa, layananMitraJasaTinjauan } from "./schema";

/** The scorecard's window: the last 90 days, from the Clock (`addWibDays`, so a WIB day is a 24 h day). */
export const SKOR_WINDOW_HARI = 90;

/** What one review row is opened on: a WIB month, "YYYY-MM". */
function bulanOf(now: Date): string {
  return wibDateOf(now).slice(0, 7);
}

/** The five numbers the spec lists, over the last 90 days. */
export interface SkorMitraJasa {
  /** Jobs finished inside the window. */
  selesai: number;
  /** Of those, finished after the target date or cancelled for lateness. */
  terlambat: number;
  /** Jobs whose Keluhan was upheld. */
  keluhanUpheld: number;
  /** Declines and "Tidak direspons" together, as the spec's one line. */
  declines: number;
  /** The mean of the Penilaian given inside the window, or null when none was. */
  rataPenilaian: number | null;
  /** The window itself, as the two instants it runs between (both from the Clock). */
  window: { dari: Date; sampai: Date };
}

export type ScorecardResult = { ok: true; skor: SkorMitraJasa } | WriteRefusal | { ok: false; reason: "tidak_ditemukan" };

/**
 * One Mitra Jasa's 90-day scorecard, for Admin Platform and for that Mitra Jasa
 * themselves (their own numbers are their own business: story 159's list is what
 * quality is managed by, and a suspended or ended Mitra Jasa still sees it). The
 * window ends at the Clock's now, never at the wall clock.
 */
export async function skorMitraJasa(deps: LayananDeps, by: Actor, mitraJasaId: string): Promise<ScorecardResult> {
  const [row] = await deps.db
    .select({ id: layananMitraJasa.id, email: layananMitraJasa.email })
    .from(layananMitraJasa)
    .where(eq(layananMitraJasa.id, mitraJasaId))
    .limit(1);
  if (!row) return { ok: false, reason: "tidak_ditemukan" };
  if (!bolehBacaSkor(by, row.email)) return { ok: false, reason: "tidak_berwenang" };
  return { ok: true, skor: hitungSkor(deps, await deps.pekerjaan.daftarPekerjaan(mitraJasaId)) };
}

/** The same scorecard for the signed-in Mitra Jasa themself, or `tidak_ditemukan` when that address is none. */
export async function skorSaya(deps: LayananDeps, by: Actor): Promise<ScorecardResult> {
  const refusal = writeRefusal(by, "mitra_jasa.lihat_saya", { kind: "akun", accountId: by.accountId });
  if (refusal) return refusal;
  const profile = await profileFor(deps, by);
  if (!profile) return { ok: false, reason: "tidak_ditemukan" };
  return { ok: true, skor: hitungSkor(deps, await deps.pekerjaan.daftarPekerjaan(profile.id)) };
}

function bolehBacaSkor(by: Actor, email: string): boolean {
  if (by.roles.includes("admin_platform")) return true;
  return by.roles.includes("mitra_jasa") && by.email.toLowerCase() === email.toLowerCase();
}

/** The five numbers over the last 90 days from the Clock, out of one Mitra Jasa's jobs. */
export function hitungSkor(deps: LayananDeps, pekerjaan: PekerjaanMitraJasa[]): SkorMitraJasa {
  const sampai = deps.clock.now();
  const dari = addWibDays(sampai, -SKOR_WINDOW_HARI);
  const dalam = pekerjaan.filter((job) => job.dihitungPada !== null && job.dihitungPada.getTime() > dari.getTime() && job.dihitungPada.getTime() <= sampai.getTime());
  const penilaian = dalam.flatMap((job) => (job.penilaian === null ? [] : [job.penilaian]));
  return {
    selesai: dalam.filter((job) => job.status === "selesai").length,
    terlambat: dalam.filter((job) => job.terlambat).length,
    /** Jobs whose Keluhan Admin Platform upheld. */
    keluhanUpheld: dalam.filter((job) => job.keluhanUpheld).length,
    declines: dalam.filter((job) => job.ditolak || job.tidakDirespons).length,
    rataPenilaian: penilaian.length === 0 ? null : penilaian.reduce((total, nilai) => total + nilai, 0) / penilaian.length,
    window: { dari, sampai },
  };
}

/** One review row, as the Admin Platform review page and the Tier 4 row read it. */
export interface TinjauanMitraJasa {
  id: string;
  mitraJasaId: string;
  namaLengkap: string;
  bulan: string;
  skor: Omit<SkorMitraJasa, "window">;
  dibukaPada: Date;
  ditinjauPada: Date | null;
  catatan: string | null;
}

const tinjauanColumns = {
  id: layananMitraJasaTinjauan.id,
  mitraJasaId: layananMitraJasaTinjauan.mitraJasaId,
  namaLengkap: layananMitraJasa.namaLengkap,
  bulan: layananMitraJasaTinjauan.bulan,
  selesai: layananMitraJasaTinjauan.selesai,
  terlambat: layananMitraJasaTinjauan.terlambat,
  keluhanUpheld: layananMitraJasaTinjauan.keluhanUpheld,
  declines: layananMitraJasaTinjauan.declines,
  rataPenilaian: layananMitraJasaTinjauan.rataPenilaian,
  dibukaPada: layananMitraJasaTinjauan.dibukaPada,
  ditinjauPada: layananMitraJasaTinjauan.ditinjauPada,
  catatan: layananMitraJasaTinjauan.catatan,
};

/**
 * The monthly scorecard review rows still open (Admin Platform only): one per
 * Mitra Jasa per WIB month, opened by the tick and closed by recording the review.
 * This is the Tier 4 "monthly scorecard review" row's own query.
 */
export async function tinjauanTerbuka(deps: LayananDeps, by: Actor): Promise<TinjauanMitraJasa[]> {
  if (writeRefusal(by, "mitra_jasa.lihat_semua", { kind: "mitra_jasa_semua" })) return [];
  const rows = await deps.db
    .select(tinjauanColumns)
    .from(layananMitraJasaTinjauan)
    .innerJoin(layananMitraJasa, eq(layananMitraJasa.id, layananMitraJasaTinjauan.mitraJasaId))
    .where(and(eq(layananMitraJasaTinjauan.bulan, bulanOf(deps.clock.now())), isNull(layananMitraJasaTinjauan.ditinjauPada)))
    .orderBy(asc(layananMitraJasa.namaLengkap), asc(layananMitraJasaTinjauan.id));
  return rows.map(keTinjauan);
}

/** One Mitra Jasa's review rows, oldest month first (Admin Platform only). */
export async function tinjauanMitraJasa(deps: LayananDeps, by: Actor, mitraJasaId: string): Promise<TinjauanMitraJasa[]> {
  if (writeRefusal(by, "mitra_jasa.lihat", { kind: "mitra_jasa", id: mitraJasaId })) return [];
  const rows = await deps.db
    .select(tinjauanColumns)
    .from(layananMitraJasaTinjauan)
    .innerJoin(layananMitraJasa, eq(layananMitraJasa.id, layananMitraJasaTinjauan.mitraJasaId))
    .where(eq(layananMitraJasaTinjauan.mitraJasaId, mitraJasaId))
    .orderBy(asc(layananMitraJasaTinjauan.bulan), asc(layananMitraJasaTinjauan.id));
  return rows.map(keTinjauan);
}

function keTinjauan(row: {
  id: string;
  mitraJasaId: string;
  namaLengkap: string;
  bulan: string;
  selesai: number;
  terlambat: number;
  keluhanUpheld: number;
  declines: number;
  rataPenilaian: number | null;
  dibukaPada: Date;
  ditinjauPada: Date | null;
  catatan: string | null;
}): TinjauanMitraJasa {
  return {
    id: row.id,
    mitraJasaId: row.mitraJasaId,
    namaLengkap: row.namaLengkap,
    bulan: row.bulan,
    skor: {
      selesai: row.selesai,
      terlambat: row.terlambat,
      keluhanUpheld: row.keluhanUpheld,
      declines: row.declines,
      rataPenilaian: row.rataPenilaian,
    },
    dibukaPada: row.dibukaPada,
    ditinjauPada: row.ditinjauPada,
    catatan: row.catatan,
  };
}

export type CatatTinjauanResult = WriteRefusal | { ok: true } | { ok: false; reason: "tidak_ditemukan" | "sudah_ditinjau" };

/**
 * Admin Platform records the monthly scorecard review, with a note, which closes
 * that month's row. The numbers stay as the tick counted them: the review is a
 * judgement about the window the row was opened on, not a fresh scorecard. Audited.
 */
export async function catatTinjauan(
  deps: LayananDeps,
  by: Actor,
  input: { mitraJasaId: string; tinjauanId: string; catatan: string | null },
): Promise<CatatTinjauanResult> {
  const refusal = writeRefusal(by, "mitra_jasa.tinjau_skor", { kind: "mitra_jasa", id: input.mitraJasaId });
  if (refusal) return refusal;
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx
      .select()
      .from(layananMitraJasaTinjauan)
      .where(and(eq(layananMitraJasaTinjauan.id, input.tinjauanId), eq(layananMitraJasaTinjauan.mitraJasaId, input.mitraJasaId)))
      .for("update");
    if (!row) return { ok: false as const, reason: "tidak_ditemukan" as const };
    if (row.ditinjauPada) return { ok: false as const, reason: "sudah_ditinjau" as const };
    const catatan = input.catatan?.trim() || null;
    await tx
      .update(layananMitraJasaTinjauan)
      .set({ ditinjauPada: now, ditinjauOlehAccountId: by.accountId, catatan })
      .where(eq(layananMitraJasaTinjauan.id, input.tinjauanId));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "mitra_jasa.catat_tinjauan",
      entity: { kind: "mitra_jasa", id: input.mitraJasaId },
      before: { bulan: row.bulan, ditinjauPada: null, catatan: null },
      after: { bulan: row.bulan, ditinjauPada: now, catatan },
      reason: catatan,
    });
    return { ok: true as const };
  });
}

/**
 * The monthly tick: one review row per Mitra Jasa for the current WIB month,
 * carrying the 90-day numbers as they stand now. Idempotent — the unique pair
 * (Mitra Jasa, month) means running it twice changes nothing, which is what every
 * tick in this repo owes.
 *
 * A Mitra Jasa no longer taking work still gets a row: the review is how quality is
 * managed by judgement (story 159), and a `Berhenti` one is judged on the work
 * already behind them.
 */
export async function tinjauSkorTick(deps: LayananDeps, now: Date): Promise<void> {
  const bulan = bulanOf(now);
  const rows = await deps.db.select({ id: layananMitraJasa.id }).from(layananMitraJasa);
  if (rows.length === 0) return;
  const sudah = await deps.db
    .select({ mitraJasaId: layananMitraJasaTinjauan.mitraJasaId })
    .from(layananMitraJasaTinjauan)
    .where(
      and(
        eq(layananMitraJasaTinjauan.bulan, bulan),
        inArray(layananMitraJasaTinjauan.mitraJasaId, rows.map((row) => row.id)),
      ),
    );
  const sudahIds = new Set(sudah.map((row) => row.mitraJasaId));
  for (const row of rows.filter((satu) => !sudahIds.has(satu.id))) {
    const skor = hitungSkor(deps, await deps.pekerjaan.daftarPekerjaan(row.id));
    await deps.db
      .insert(layananMitraJasaTinjauan)
      .values({
        mitraJasaId: row.id,
        bulan,
        selesai: skor.selesai,
        terlambat: skor.terlambat,
        keluhanUpheld: skor.keluhanUpheld,
        declines: skor.declines,
        rataPenilaian: skor.rataPenilaian,
        dibukaPada: now,
      })
      .onConflictDoNothing();
  }
}

async function profileFor(deps: LayananDeps, by: Actor): Promise<{ id: string } | null> {
  const [row] = await deps.db
    .select({ id: layananMitraJasa.id })
    .from(layananMitraJasa)
    .where(eq(layananMitraJasa.email, by.email.toLowerCase()))
    .limit(1);
  return row ?? null;
}
