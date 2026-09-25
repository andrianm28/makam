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

/** "01/10/2026 09.00.00 WIB": Indonesian-style date and time, in WIB. */
export function formatWib(instant: Date): string {
  const parts = Object.fromEntries(
    wibFormat.formatToParts(instant).map((part) => [part.type, part.value]),
  );
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}.${parts.minute}.${parts.second} WIB`;
}
