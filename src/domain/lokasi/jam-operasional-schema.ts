/**
 * The shape of a Jam Operasional and the rules a valid one follows. Pure: the
 * Lokasi module validates with it before every write, the calculator reads
 * the same types, and Server Actions pipe their form input into it.
 */
import { z } from "zod";

export const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof weekdays)[number];

/** A WIB wall-clock time "HH:MM", 00:00–24:00; "24:00" is the end of the day (only as a close). */
export type JamMenit = string;

/** A WIB calendar date "YYYY-MM-DD". */
export type Tanggal = string;

/** One weekday's open hours, `opens` before `closes`; no span crosses midnight. */
export interface OpenHours {
  opens: JamMenit;
  closes: JamMenit;
}

/** A Tanggal Tutup: a whole date on which the Lokasi is closed despite its weekly hours, with an optional note. */
export interface TanggalTutup {
  date: Tanggal;
  note: string;
}

/** A Lokasi's Jam Operasional: weekly hours (null = closed that weekday) and its Tanggal Tutup. */
export interface JamOperasional {
  weekly: Record<Weekday, OpenHours | null>;
  tanggalTutup: TanggalTutup[];
}

/** Minutes after 00:00 of a JamMenit ("24:00" is 1440). */
export function minutesOf(time: JamMenit): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** At most this many Tanggal Tutup are kept (about a year's worth). */
export const MAX_TANGGAL_TUTUP = 366;

/** A real WIB calendar date, "YYYY-MM-DD". */
export const tanggalSchema = z.iso.date();

/** "HH:MM" from 00:00 to 24:00. */
export const jamMenitSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$|^24:00$/);

const openHoursSchema = z
  .object({ opens: jamMenitSchema, closes: jamMenitSchema })
  .refine((hours) => minutesOf(hours.opens) < minutesOf(hours.closes), "jam buka harus sebelum jam tutup");

export const tanggalTutupSchema = z.object({ date: tanggalSchema, note: z.string().trim().max(100) });

/**
 * A valid Jam Operasional: each weekday closed (null) or open "HH:MM"–"HH:MM"
 * WIB with the opening first (a close may be "24:00"); Tanggal Tutup on
 * distinct real dates, stored in date order.
 */
export const jamOperasionalSchema = z
  .object({
    weekly: z.object(
      Object.fromEntries(weekdays.map((weekday) => [weekday, openHoursSchema.nullable()])) as Record<
        Weekday,
        z.ZodNullable<typeof openHoursSchema>
      >,
    ),
    tanggalTutup: z
      .array(tanggalTutupSchema)
      .max(MAX_TANGGAL_TUTUP)
      .refine(
        (tanggalTutup) => new Set(tanggalTutup.map((tutup) => tutup.date)).size === tanggalTutup.length,
        "setiap tanggal tutup hanya sekali",
      ),
  })
  .refine((jam) => weekdays.some((weekday) => jam.weekly[weekday] !== null), "minimal satu hari buka")
  .transform(
    (jam): JamOperasional => ({ ...jam, tanggalTutup: [...jam.tanggalTutup].sort((a, b) => a.date.localeCompare(b.date)) }),
  );
