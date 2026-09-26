/**
 * Asia/Jakarta (WIB) time. Jakarta has no daylight saving, so WIB is always
 * UTC+07:00; these helpers never depend on the host's TZ setting.
 */
export const JAKARTA_TIME_ZONE = "Asia/Jakarta";
const WIB_OFFSET = "+07:00";

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * The instant for a WIB wall-clock time: `wib("2026-10-01 09:00")`,
 * `wib("2026-10-01")` (midnight), `wib("2026-10-01T09:00:30")`.
 */
export function wib(wallClock: string): Date {
  const match = WALL_CLOCK.exec(wallClock);
  if (!match) throw new Error(`Not a WIB wall-clock time: "${wallClock}"`);
  const [, year, month, day, hour = "00", minute = "00", second = "00"] = match;
  const instant = new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}${WIB_OFFSET}`);
  if (Number.isNaN(instant.getTime())) throw new Error(`Not a WIB wall-clock time: "${wallClock}"`);
  return instant;
}

const wibFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: JAKARTA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function wibParts(instant: Date): Record<string, string> {
  return Object.fromEntries(wibFormat.formatToParts(instant).map((part) => [part.type, part.value]));
}

/** "01/10/2026 09.00.00 WIB": Indonesian-style date and time, in WIB. */
export function formatWib(instant: Date): string {
  const parts = wibParts(instant);
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}.${parts.minute}.${parts.second} WIB`;
}

/** The WIB calendar date of an instant, "YYYY-MM-DD" (the inverse of `wib("YYYY-MM-DD")` for midnight). */
export function wibDateOf(instant: Date): string {
  const parts = wibParts(instant);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const OFFSET_MS = 7 * HOUR_MS;

/** The instant shifted to WIB wall-clock, for reading its UTC fields as WIB fields. */
function wall(instant: Date): Date {
  return new Date(instant.getTime() + OFFSET_MS);
}

/** 00:00 WIB of the day `instant` falls in. */
export function wibDayStart(instant: Date): Date {
  return new Date(Math.floor((instant.getTime() + OFFSET_MS) / DAY_MS) * DAY_MS - OFFSET_MS);
}

/** The same WIB wall-clock time `days` days later (WIB has no daylight saving, so a day is always 24 h). */
export function addWibDays(instant: Date, days: number): Date {
  return new Date(instant.getTime() + days * DAY_MS);
}

/** "09:30": the WIB wall-clock time of `instant`, to the minute. */
export function wibTime(instant: Date): string {
  return wall(instant).toISOString().slice(11, 16);
}

/** The WIB weekday of `instant`: 0 = Monday … 6 = Sunday (the order of `NAMA_HARI`). */
export function wibWeekdayIndex(instant: Date): number {
  return (wall(instant).getUTCDay() + 6) % 7;
}

/** Indonesian weekday names, Monday first. */
export const NAMA_HARI = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"] as const;

/** Indonesian month names, January first. */
export const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

/** "1 November 2026" for a WIB calendar date "2026-11-01". */
export function formatTanggal(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${NAMA_BULAN[month - 1]} ${year}`;
}

/** "1 Oktober 2026, 21.00 WIB": the WIB date and time of `instant`, in Indonesian. */
export function formatTanggalJam(instant: Date): string {
  return `${formatTanggal(wibDateOf(instant))}, ${wibTime(instant).replace(":", ".")} WIB`;
}

/** "Senin, 5 Oktober": the WIB weekday and date of `instant`, in Indonesian. */
export function formatWibHariTanggal(instant: Date): string {
  const shifted = wall(instant);
  return `${NAMA_HARI[wibWeekdayIndex(instant)]}, ${shifted.getUTCDate()} ${NAMA_BULAN[shifted.getUTCMonth()]}`;
}
