/**
 * The working-time calculator (spec, Lokasi): service-hour deadlines inside a
 * Jam Operasional (or the fixed TPU window), and the working-day calendars.
 * Pure: every function takes its start instant; `createWorkingTime` binds the
 * Clock for callers that pass none. All wall-clock reasoning is WIB (UTC+07:00,
 * no daylight saving), so a day is a fixed 24 h from 00:00 WIB.
 */

export const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type Weekday = (typeof weekdays)[number];

/** One weekday's open hours, "HH:MM" WIB, `opens` before `closes` ("24:00" allowed as a close). */
export interface OpenHours {
  opens: string;
  closes: string;
}

/** A Lokasi's Jam Operasional: weekly hours (null = closed that weekday) and dated closures (whole days). */
export interface JamOperasional {
  weekly: Record<Weekday, OpenHours | null>;
  closures: { date: string; note: string }[];
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WIB_OFFSET = 7 * HOUR;
/** No search looks further ahead than this: a Jam Operasional has an open weekday and finitely many closures. */
const MAX_DAYS_AHEAD = 3 * 366;

/** 00:00 WIB of the day `instant` falls in, as epoch ms. */
function dayStartOf(instant: number): number {
  return Math.floor((instant + WIB_OFFSET) / DAY) * DAY - WIB_OFFSET;
}

function dateKeyOf(dayStart: number): string {
  return new Date(dayStart + WIB_OFFSET).toISOString().slice(0, 10);
}

function weekdayOf(dayStart: number): Weekday {
  // getUTCDay: 0 = Sunday; `weekdays` starts on Monday.
  return weekdays[(new Date(dayStart + WIB_OFFSET).getUTCDay() + 6) % 7];
}

function minutesOf(time: string): number {
  const [hour, minute] = time.split(":").map(Number);
  return hour * 60 + minute;
}

/** The open window of the day starting at `dayStart`, or null when it is closed. */
function openWindow(schedule: JamOperasional, dayStart: number): { opens: number; closes: number } | null {
  const hours = schedule.weekly[weekdayOf(dayStart)];
  if (!hours) return null;
  const date = dateKeyOf(dayStart);
  if (schedule.closures.some((closure) => closure.date === date)) return null;
  return { opens: dayStart + minutesOf(hours.opens) * MINUTE, closes: dayStart + minutesOf(hours.closes) * MINUTE };
}

/**
 * The instant `hours` service hours after `start`, counting only open hours:
 * the clock pauses outside them, on closed weekdays and on dated closures.
 */
export function deadline(schedule: JamOperasional, start: Date, hours: number): Date {
  if (!(hours > 0) || !Number.isFinite(hours)) throw new RangeError(`service hours must be positive: ${hours}`);
  let remaining = hours * HOUR;
  const from = start.getTime();
  for (let day = 0, dayStart = dayStartOf(from); day <= MAX_DAYS_AHEAD; day++, dayStart += DAY) {
    const window = openWindow(schedule, dayStart);
    if (!window) continue;
    const counted = Math.max(from, window.opens);
    if (counted >= window.closes) continue;
    if (remaining <= window.closes - counted) return new Date(counted + remaining);
    remaining -= window.closes - counted;
  }
  throw new RangeError("Jam Operasional has no open hours ahead");
}

/**
 * The close of the first open day after the day `start` falls in: "by the end
 * of the Lokasi's next working day". The day of `start` itself never counts,
 * even before its opening.
 */
export function nextWorkingDayEnd(schedule: JamOperasional, start: Date): Date {
  for (let day = 1, dayStart = dayStartOf(start.getTime()) + DAY; day <= MAX_DAYS_AHEAD; day++, dayStart += DAY) {
    const window = openWindow(schedule, dayStart);
    if (window) return new Date(window.closes);
  }
  throw new RangeError("Jam Operasional has no open day ahead");
}

const daytime: OpenHours = { opens: "06:00", closes: "18:00" };

/** The fixed TPU window: 06:00–18:00 WIB every day, no closures. */
export const TPU_SCHEDULE: JamOperasional = {
  weekly: Object.fromEntries(weekdays.map((weekday) => [weekday, daytime])) as Record<Weekday, OpenHours>,
  closures: [],
};

/** "N daytime hours" (the Keluhan first response): hours counted only within 06:00–18:00 WIB, i.e. the TPU schedule. */
export function daytimeHoursDeadline(start: Date, hours: number): Date {
  return deadline(TPU_SCHEDULE, start, hours);
}
