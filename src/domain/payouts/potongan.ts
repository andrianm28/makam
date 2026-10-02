/**
 * Potongan (CONTEXT.md: an amount a Lokasi Mitra owes the Operator, deducted
 * from its next Pencairan; spec, Billing > Payouts; ticket 32's AC 4).
 *
 * Three things make a Potongan safe here, and all three are in the database:
 * - **It belongs to a Lokasi Mitra.** `catatPotongan` takes a `lokasiId` and
 *   nothing else, so there is no shape in which a Mitra Jasa can be charged
 *   one, and `terbitkanBuktiPencairan` refuses to net any against a Mitra
 *   Jasa's transfer ("Potongan are never applied to Mitra Jasa").
 * - **It is netted at most once.** `terpotong_sebesar` counts what a Bukti
 *   Pencairan took, so a part-netted Potongan keeps its remainder and offers
 *   it again, while a fully netted one becomes `terpotong` and never returns
 *   to a run. A unique index on `bukti_pencairan_potongan.potongan_id` is the
 *   database's half of the same rule.
 * - **It ages, but never expires.** After 60 days the tick turns it into an
 *   offline request, which is a request and not a write-off: whatever is still
 *   owed stays owed until Admin Platform records its payment.
 */
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import { pencairanResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { rupiahSchema } from "@/lib/rupiah";
import { wib, wibDateOf } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";
import { potongan, type PotonganAlasanKind } from "./schema";

/** How long a Potongan carries forward before it becomes an offline request (AC 4). */
export const USIA_POTONGAN_HARI = 60;

const SEHARI = 24 * 60 * 60 * 1000;
const ALASAN_MAX = 500;

/** One row of `potongan`, as read. */
export type PotonganRow = typeof potongan.$inferSelect;

export interface PotonganDeps {
  db: Database;
  clock: Clock;
  audit: AuditLog;
  /** Whether an id is a Lokasi Mitra's at all, so an unknown one is refused rather than charged. */
  lokasiAda: (lokasiId: string) => Promise<boolean>;
}

export interface CatatPotonganInput {
  /** The Lokasi Mitra that owes it. Never a Mitra Jasa. */
  lokasiId: string;
  /** Whole rupiah, positive: what the Lokasi owes. */
  amount: number;
  /** Which kind of debt: a platform fee on money it received directly, a refund of money already paid out, or another. */
  alasanKind: PotonganAlasanKind;
  /** Why, in words (a staff write, so it always has one). */
  alasan: string;
  /** A link to what shows the debt: a Bukti Pengembalian Dana's page, an email. */
  tautan?: string | null;
}

export type CatatPotonganResult =
  | { ok: true; potongan: BarisPotonganUmum }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  | { ok: false; reason: "input_tidak_valid" };

/** One Potongan's values, whether a person records it or a trigger does. */
export interface NilaiPotongan {
  lokasiId: string;
  amount: number;
  alasanKind: PotonganAlasanKind;
  alasan: string;
  tautan?: string | null;
  /** The Tagihan and order the debt came from, when it came from one. */
  sumberTagihanId?: string | null;
  sumberNomorPemesanan?: string | null;
}

/**
 * Inserts one Potongan in `tx`: the one place a debt is written, so a trigger's
 * platform fee and a person recording a refund end up with the same shape. The
 * unique index on (its source Tagihan, its kind) makes a repeated run a no-op
 * rather than a second charge. The row, or null when that debt was already
 * recorded.
 */
export async function sisipPotongan(tx: Database, values: NilaiPotongan, now: Date): Promise<PotonganRow | null> {
  const parsed = inputSchema.safeParse({ ...values, tautan: values.tautan ?? null });
  if (!parsed.success || parsed.data.amount === 0) return null;
  const [row] = await tx
    .insert(potongan)
    .values({
      lokasiId: parsed.data.lokasiId,
      amount: parsed.data.amount,
      alasanKind: parsed.data.alasanKind,
      alasan: parsed.data.alasan,
      tautan: parsed.data.tautan,
      sumberTagihanId: values.sumberTagihanId ?? null,
      sumberNomorPemesanan: values.sumberNomorPemesanan ?? null,
      status: "berjalan",
      dibuatPada: now,
    })
    .onConflictDoNothing({ target: [potongan.sumberTagihanId, potongan.alasanKind] })
    .returning();
  return row ?? null;
}

/** A Potongan as its own list and the Admin Lokasi view read it. */
export interface BarisPotonganUmum {
  id: string;
  lokasiId: string;
  amount: number;
  /** How much a Bukti Pencairan has already taken; the rest is still owed. */
  terpotongSebesar: number;
  sisa: number;
  alasanKind: PotonganAlasanKind;
  alasan: string;
  tautan: string | null;
  status: "berjalan" | "perlu_offline" | "terpotong" | "lunas" | "dibatalkan";
  /** The instant it became an offline request (60 days), or null. */
  perluOfflinePada: Date | null;
  /** When it was settled: netted in a Bukti Pencairan, or paid offline. */
  tercatatPada: Date | null;
  dibuatPada: Date;
}

const inputSchema = z.object({
  lokasiId: z.string().trim().min(1).max(64),
  amount: rupiahSchema,
  alasanKind: z.enum(["biaya_layanan_platform", "pengembalian_dana", "lainnya"]),
  alasan: z.string().trim().min(1).max(ALASAN_MAX),
  tautan: z.string().trim().max(2000).nullish(),
});

/**
 * Admin Platform records an amount a Lokasi Mitra owes the Operator: a negative
 * line in its next Pencairan, with a reason and a link, carried forward until
 * it fits (AC 4). Audited. Refused for an id that is no Lokasi Mitra's, which
 * is also what makes "never a Mitra Jasa" true rather than merely intended.
 */
export async function catatPotongan(deps: PotonganDeps, by: Actor, input: CatatPotonganInput): Promise<CatatPotonganResult> {
  const refusal = writeRefusal(by, "pencairan.kelola", pencairanResource());
  if (refusal) return refusal;
  const parsed = inputSchema.safeParse({ ...input, tautan: input.tautan ?? null });
  if (!parsed.success || parsed.data.amount === 0) return { ok: false, reason: "input_tidak_valid" };
  // Whether the id is a Lokasi Mitra's at all, asked of the Lokasi module: a
  // Potongan charged to an id that is nobody's is money that would vanish.
  if (!(await deps.lokasiAda(parsed.data.lokasiId))) return { ok: false, reason: "tidak_ditemukan" };
  const now = deps.clock.now();
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const row = await sisipPotongan(tx, parsed.data, now);
    if (!row) return { ok: false, reason: "input_tidak_valid" } as const;
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pencairan.catat_potongan",
      entity: { kind: "potongan", id: row.id },
      lokasiId: row.lokasiId,
      before: null,
      after: { amount: row.amount, alasanKind: row.alasanKind, alasan: row.alasan, tautan: row.tautan },
      reason: row.alasan,
    });
    return { ok: true, potongan: toUmum(row) } as const;
  });
}

export type CatatPotonganLunasResult =
  | { ok: true; potongan: BarisPotonganUmum }
  | WriteRefusal
  | { ok: false; reason: "tidak_ditemukan" }
  /** A Bukti Pencairan already took it (or it was recorded once): the money is settled. */
  | { ok: false; reason: "sudah_tercatat" }
  | { ok: false; reason: "tanggal_tidak_valid" };

/**
 * Admin Platform records that a Potongan was paid outside a Pencairan run — the
 * offline path a Potongan becomes at 60 days, or one a Lokasi settles directly.
 * Audited, and refused for a Potongan that a Bukti Pencairan already took.
 */
export async function catatPotonganLunas(
  deps: PotonganDeps,
  by: Actor,
  input: { potonganId: string; /** The day the money arrived, WIB "YYYY-MM-DD", never in the future. */ dibayarPada: string },
): Promise<CatatPotonganLunasResult> {
  const refusal = writeRefusal(by, "pencairan.kelola", pencairanResource());
  if (refusal) return refusal;
  if (!z.uuid().safeParse(input.potonganId).success) return { ok: false, reason: "tidak_ditemukan" };
  const tanggal = z.iso.date().safeParse(input.dibayarPada);
  const hariIni = wibDateOf(deps.clock.now());
  if (!tanggal.success || tanggal.data > hariIni) return { ok: false, reason: "tanggal_tidak_valid" };
  return deps.audit.staffWrite(deps.db, async (tx, record) => {
    const [row] = await tx.select().from(potongan).where(eq(potongan.id, input.potonganId)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" } as const;
    if (row.status === "terpotong" || row.status === "lunas") return { ok: false, reason: "sudah_tercatat" } as const;
    await tx
      .update(potongan)
      .set({ status: "lunas", tercatatPada: wib(`${tanggal.data}T00:00`), dicatatOleh: by.accountId, terpotongSebesar: row.amount })
      .where(eq(potongan.id, row.id));
    await record({
      actor: { accountId: by.accountId, role: "admin_platform" },
      action: "pencairan.catat_potongan_lunas",
      entity: { kind: "potongan", id: row.id },
      lokasiId: row.lokasiId,
      before: { status: row.status, terpotongSebesar: row.terpotongSebesar },
      after: { status: "lunas", terpotongSebesar: row.amount },
      reason: row.alasan,
    });
    const [setelah] = await tx.select().from(potongan).where(eq(potongan.id, row.id));
    return { ok: true, potongan: toUmum(setelah) } as const;
  });
}

/**
 * The ageing tick (AC 4, first half): every Potongan recorded 60 days ago and
 * still `berjalan` becomes an offline request, which Admin Platform records when
 * it is paid. Idempotent — the status only ever moves this way, and the tick's own
 * `where` leaves everything else alone.
 *
 * **The second half of AC 4 is not here.** The spec also turns a Potongan into an
 * offline request when the Lokasi Mitra goes **Berhenti**, and that trigger is
 * the Lokasi module's (ticket 59, "Lokasi Mitra Ditangguhkan dan Berhenti",
 * blocked by 32, 38 and 54), so it cannot be written before this ticket merges.
 * Nothing in this module reads a Lokasi Mitra's status and nothing here will:
 * a Berhenti Lokasi's `berjalan` Potongan simply keeps ageing on this tick, which
 * is the safe direction. Recorded in the ticket's `## Comments`.
 *
 * Returns the ids it moved.
 */
export async function tickPotonganUsia(db: Database, now: Date): Promise<string[]> {
  const batas = new Date(now.getTime() - USIA_POTONGAN_HARI * SEHARI);
  const moved = await db
    .update(potongan)
    .set({ status: "perlu_offline", perluOfflinePada: now })
    .where(and(eq(potongan.status, "berjalan"), lte(potongan.dibuatPada, batas)))
    .returning({ id: potongan.id });
  return moved.map((row) => row.id);
}

/** Every Potongan of one Lokasi Mitra, newest last, whatever its status (the Admin Lokasi's own list). */
export async function potonganOfLokasi(db: Database, lokasiId: string): Promise<BarisPotonganUmum[]> {
  const rows = await db.select().from(potongan).where(eq(potongan.lokasiId, lokasiId)).orderBy(asc(potongan.dibuatPada), asc(potongan.id));
  return rows.map(toUmum);
}

/** Every Potongan waiting to be paid offline, oldest first: what Admin Platform settles outside a run. */
export async function potonganPerluOffline(db: Database): Promise<BarisPotonganUmum[]> {
  const rows = await db.select().from(potongan).where(eq(potongan.status, "perlu_offline")).orderBy(asc(potongan.dibuatPada), asc(potongan.id));
  return rows.map(toUmum);
}

/** The ids of a set of Potongan that are still `berjalan`, for a caller that must check its own list. */
export async function potonganBerjalanIds(db: Database, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ id: potongan.id })
    .from(potongan)
    .where(and(inArray(potongan.id, [...ids]), eq(potongan.status, "berjalan")));
  return rows.map((row) => row.id);
}

function toUmum(row: typeof potongan.$inferSelect): BarisPotonganUmum {
  return {
    id: row.id,
    lokasiId: row.lokasiId,
    amount: row.amount,
    terpotongSebesar: row.terpotongSebesar,
    sisa: row.amount - row.terpotongSebesar,
    alasanKind: row.alasanKind as PotonganAlasanKind,
    alasan: row.alasan,
    tautan: row.tautan,
    status: row.status,
    perluOfflinePada: row.perluOfflinePada,
    tercatatPada: row.tercatatPada,
    dibuatPada: row.dibuatPada,
  };
}

/**
 * A Lokasi Mitra went Berhenti (ticket 59): everything it still owes through a running Potongan becomes an
 * offline request at once, which Admin Platform records when it is paid (spec, Payouts > Potongan). Called by the
 * Berhenti effective-date sweep. Idempotent; returns the ids it moved.
 */
export async function potonganBerhenti(db: Database, lokasiId: string, now: Date): Promise<string[]> {
  const moved = await db
    .update(potongan)
    .set({ status: "perlu_offline", perluOfflinePada: now })
    .where(and(eq(potongan.lokasiId, lokasiId), eq(potongan.status, "berjalan")))
    .returning({ id: potongan.id });
  return moved.map((row) => row.id);
}
