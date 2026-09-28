/**
 * The working-time calculator (spec, Lokasi): service-hour deadlines inside a
 * Jam Operasional (or the fixed TPU window), and Hari Kerja deadlines. Every
 * calendar is a Jam Operasional: a Lokasi's own, the TPU window, or the Admin
 * Platform's (Monday–Friday, each Hari Libur Nasional a Tanggal Tutup), so one
 * `openWindow` serves them all. Pure: every function takes its start instant.
 * All wall-clock reasoning is WIB (`@/lib/time/jakarta`).
 */
import { addWibDays, wibDateOf, wibDayStart, wibWeekdayIndex } from "@/lib/time/jakarta";
import { minutesOf, weekdays, type JamOperasional, type OpenHours, type Tanggal, type Weekday } from "./jam-operasional-schema";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
/** No search looks further ahead than this: a counted Jam Operasional has an open weekday, and a Lokasi at most a year of Tanggal Tutup. */
const MAX_DAYS_AHEAD = 3 * 366;

/** The calculator cannot answer for a Lokasi whose Admin Lokasi has not saved its Jam Operasional yet. */
export type JamOperasionalBelumDiisi = { ok: false; reason: "jam_operasional_belum_diisi" };

/** A saved Jam Operasional with every weekday closed: nothing can be counted inside it. */
export type JamOperasionalTanpaJamBuka = { ok: false; reason: "jam_operasional_tanpa_jam_buka" };

/**
 * A calculator answer: the deadline instant, or why there is none. A Lokasi's
 * Jam Operasional is null until saved, and every calculator function refuses
 * it rather than guess a schedule; one closed every weekday is refused too.
 */
export type WorkingTimeResult = { ok: true; at: Date } | JamOperasionalBelumDiisi | JamOperasionalTanpaJamBuka;

const belumDiisi: JamOperasionalBelumDiisi = { ok: false, reason: "jam_operasional_belum_diisi" };
const tanpaJamBuka: JamOperasionalTanpaJamBuka = { ok: false, reason: "jam_operasional_tanpa_jam_buka" };

function hasOpenWeekday(schedule: JamOperasional): boolean {
  return weekdays.some((weekday) => schedule.weekly[weekday] !== null);
}

/** The open window of the WIB day starting at `dayStart`, or null when it is closed (weekday closed, or a Tanggal Tutup). */
function openWindow(schedule: JamOperasional, dayStart: Date): { opens: number; closes: number } | null {
  const hours = schedule.weekly[weekdays[wibWeekdayIndex(dayStart)]];
  if (!hours) return null;
  const date = wibDateOf(dayStart);
  if (schedule.tanggalTutup.some((tutup) => tutup.date === date)) return null;
  const midnight = dayStart.getTime();
  return { opens: midnight + minutesOf(hours.opens) * MINUTE, closes: midnight + minutesOf(hours.closes) * MINUTE };
}

/**
 * Whether `at` falls inside the schedule's open window on its WIB day: an
 * open weekday that is not a Tanggal Tutup, between its opening and closing
 * hour. False for a Jam Operasional belum diisi, which promises nothing.
 */
export function isOpenAt(schedule: JamOperasional | null, at: Date): boolean {
  if (!schedule) return false;
  const window = openWindow(schedule, wibDayStart(at));
  if (!window) return false;
  const time = at.getTime();
  return time >= window.opens && time < window.closes;
}

/**
 * `hours` service hours after `start`, counting only open hours:
 * the clock pauses outside them, on closed weekdays and on Tanggal Tutup.
 */
export function deadline(schedule: JamOperasional | null, start: Date, hours: number): WorkingTimeResult {
  if (!(hours > 0) || !Number.isFinite(hours)) throw new RangeError(`service hours must be positive: ${hours}`);
  if (!schedule) return belumDiisi;
  if (!hasOpenWeekday(schedule)) return tanpaJamBuka;
  let remaining = hours * HOUR;
  const from = start.getTime();
  for (let day = 0, dayStart = wibDayStart(start); day <= MAX_DAYS_AHEAD; day++, dayStart = addWibDays(dayStart, 1)) {
    const window = openWindow(schedule, dayStart);
    if (!window) continue;
    const counted = Math.max(from, window.opens);
    if (counted >= window.closes) continue;
    if (remaining <= window.closes - counted) return { ok: true, at: new Date(counted + remaining) };
    remaining -= window.closes - counted;
  }
  throw new RangeError("Jam Operasional has no open hours ahead");
}

/**
 * The end of the `n`th Hari Kerja after the WIB day `start` falls in (that
 * day itself never counts): every "N hari kerja" deadline. A Hari Kerja is an
 * open day of `calendar` that is not a Tanggal Tutup; it ends at its close.
 */
export function addWorkingDays(calendar: JamOperasional | null, start: Date, n: number): WorkingTimeResult {
  if (!Number.isInteger(n) || n < 1) throw new RangeError(`Hari Kerja must be a whole number from 1: ${n}`);
  if (!calendar) return belumDiisi;
  if (!hasOpenWeekday(calendar)) return tanpaJamBuka;
  let counted = 0;
  for (let day = 1, dayStart = addWibDays(wibDayStart(start), 1); day <= MAX_DAYS_AHEAD; day++, dayStart = addWibDays(dayStart, 1)) {
    const window = openWindow(calendar, dayStart);
    if (window && ++counted === n) return { ok: true, at: new Date(window.closes) };
  }
  throw new RangeError("the calendar has no Hari Kerja ahead");
}

/**
 * The close of the first open day after the WIB day `start` falls in: "by the
 * end of the Lokasi's next Hari Kerja". The day of `start` never counts, even
 * before its opening.
 */
export function nextWorkingDayEnd(schedule: JamOperasional | null, start: Date): WorkingTimeResult {
  return addWorkingDays(schedule, start, 1);
}

/** A Hari Libur Nasional on the list Admin Platform keeps. */
export interface HariLiburNasional {
  date: Tanggal;
  name: string;
}

const adminPlatformDay: OpenHours = { opens: "00:00", closes: "23:59" };

/**
 * The Admin Platform Hari Kerja calendar as a Jam Operasional: Monday–Friday,
 * a Hari Kerja ending 23:59 WIB, and each Hari Libur Nasional a Tanggal Tutup.
 */
export function adminPlatformCalendar(hariLiburNasional: HariLiburNasional[]): JamOperasional {
  return {
    weekly: Object.fromEntries(
      weekdays.map((weekday) => [weekday, weekday === "saturday" || weekday === "sunday" ? null : adminPlatformDay]),
    ) as Record<Weekday, OpenHours | null>,
    tanggalTutup: hariLiburNasional.map((libur) => ({ date: libur.date, note: libur.name })),
  };
}

const daytime: OpenHours = { opens: "06:00", closes: "18:00" };

/** The fixed TPU window: 06:00–18:00 WIB every day, no Tanggal Tutup. */
export const TPU_SCHEDULE: JamOperasional = {
  weekly: Object.fromEntries(weekdays.map((weekday) => [weekday, daytime])) as Record<Weekday, OpenHours>,
  tanggalTutup: [],
};

/** "N daytime hours" (the Keluhan first response): hours counted only within 06:00–18:00 WIB, i.e. the TPU schedule. */
export function daytimeHoursDeadline(start: Date, hours: number): Date {
  const due = deadline(TPU_SCHEDULE, start, hours);
  if (!due.ok) throw new Error("the TPU window is always set");
  return due.at;
}

const BUKA_HARI = minutesOf(daytime.opens);
const TUTUP_HARI = minutesOf(daytime.closes);

/**
 * 06:00 WIB: the first minute of the daytime window strictly after `instant` (today's, or tomorrow's once
 * the window has closed).
 *
 * This is an **instant, not a deadline**: a TPU row created at 02:00 is announced at 06:00, and no
 * message window is any part of it. The hours stay in `daytime` above, so both ends of the window are
 * named in one place.
 */
export function nextDaytimeStart(instant: Date): Date {
  const today = new Date(wibDayStart(instant).getTime() + BUKA_HARI * MINUTE);
  return today > instant ? today : addWibDays(today, 1);
}

/** 18:00 WIB: the closing minute of the daytime window strictly after `instant` — the hour a Bertugas shift ends. */
export function nextDaytimeEnd(instant: Date): Date {
  const today = new Date(wibDayStart(instant).getTime() + TUTUP_HARI * MINUTE);
  return today > instant ? today : addWibDays(today, 1);
}
