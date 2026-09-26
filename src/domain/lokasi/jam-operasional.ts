import { eq } from "drizzle-orm";
import { z } from "zod";
import { lokasiMitraResource, writeRefusal, type Actor, type WriteRefusal } from "@/domain/identity";
import { isLokasiId, writeLokasiMitra, type LokasiDeps, type NotFound, type WriteResult } from "./lokasi-mitra";
import { lokasiMitra } from "./schema";
import { weekdays, type JamOperasional, type OpenHours, type Weekday } from "./working-time";

const workday: OpenHours = { opens: "08:00", closes: "16:00" };

/** The Jam Operasional a Lokasi Mitra has until its Admin Lokasi sets one: Monday–Saturday 08:00–16:00, closed Sunday. */
export const DEFAULT_JAM_OPERASIONAL: JamOperasional = {
  weekly: {
    monday: workday,
    tuesday: workday,
    wednesday: workday,
    thursday: workday,
    friday: workday,
    saturday: workday,
    sunday: null,
  },
  closures: [],
};

/** At most this many dated closures are kept (about a year's worth). */
export const MAX_CLOSURES = 366;

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/);
const openHoursSchema = z
  .object({ opens: time, closes: time })
  .refine((hours) => minutes(hours.opens) < minutes(hours.closes));
const isoDate = z.iso.date();

/**
 * A valid Jam Operasional: each weekday closed (null) or open "HH:MM"–"HH:MM"
 * WIB with the opening first (a close may be "24:00"); at least one weekday
 * open; dated closures on distinct real dates, each with an optional note.
 */
export const jamOperasionalSchema = z
  .object({
    weekly: z.object(
      Object.fromEntries(weekdays.map((weekday) => [weekday, openHoursSchema.nullable()])) as Record<
        Weekday,
        z.ZodNullable<typeof openHoursSchema>
      >,
    ),
    closures: z
      .array(z.object({ date: isoDate, note: z.string().trim().max(100) }))
      .max(MAX_CLOSURES)
      .refine((closures) => new Set(closures.map((closure) => closure.date)).size === closures.length),
  })
  .refine((jam) => weekdays.some((weekday) => jam.weekly[weekday] !== null))
  .transform((jam) => ({ ...jam, closures: [...jam.closures].sort((a, b) => a.date.localeCompare(b.date)) }));

export type JamOperasionalResult = { ok: true; jamOperasional: JamOperasional } | WriteRefusal | NotFound;

/** A Lokasi Mitra's Jam Operasional, for Admin Platform or one of its Admin Lokasi. */
export async function readJamOperasional(deps: LokasiDeps, by: Actor, lokasiId: string): Promise<JamOperasionalResult> {
  const refusal = writeRefusal(by, "lokasi.lihat", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const jamOperasional = await scheduleOf(deps, lokasiId);
  return jamOperasional ? { ok: true, jamOperasional } : { ok: false, reason: "tidak_ditemukan" };
}

/** A Lokasi Mitra's Jam Operasional for the calculator (no actor: server code, e.g. deadlines); null for no such Lokasi. */
export async function scheduleOf(deps: Pick<LokasiDeps, "db">, lokasiId: string): Promise<JamOperasional | null> {
  if (!isLokasiId(lokasiId)) return null;
  const [row] = await deps.db
    .select({ jamOperasional: lokasiMitra.jamOperasional })
    .from(lokasiMitra)
    .where(eq(lokasiMitra.id, lokasiId));
  if (!row) return null;
  return row.jamOperasional ?? DEFAULT_JAM_OPERASIONAL;
}

export type SetJamOperasionalResult = WriteResult | { ok: false; reason: "jam_operasional_tidak_valid" };

/**
 * The Admin Lokasi (or Admin Platform) sets a Lokasi Mitra's Jam Operasional:
 * weekly hours per weekday (possibly closed) and dated closures. Audited on
 * the Lokasi with the Jam Operasional before and after.
 */
export async function setJamOperasional(
  deps: LokasiDeps,
  by: Actor,
  lokasiId: string,
  input: JamOperasional,
): Promise<SetJamOperasionalResult> {
  const refusal = writeRefusal(by, "lokasi.atur_operasional", lokasiMitraResource(lokasiId));
  if (refusal) return refusal;
  const parsed = jamOperasionalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "jam_operasional_tidak_valid" };
  const jamOperasional = parsed.data;
  return writeLokasiMitra(
    deps,
    by,
    lokasiId,
    "lokasi.ubah_jam_operasional",
    (row) => ({
      values: { jamOperasional },
      before: { jamOperasional: row.jamOperasional ?? DEFAULT_JAM_OPERASIONAL },
      after: { jamOperasional },
    }),
    "lokasi.atur_operasional",
  );
}
