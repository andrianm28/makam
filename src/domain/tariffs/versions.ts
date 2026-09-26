import { wib } from "@/lib/time/jakarta";

/** What every price-book version carries besides its values. */
export interface VersionTimes {
  /** The effective date as entered: a WIB calendar date, "YYYY-MM-DD". */
  effectiveOn: string;
  /** The instant it is in force from: 00:00 WIB on `effectiveOn`, or the moment of entry when that is the same day. */
  inForceFrom: Date;
  /** Entry order, the tie-break between versions in force from the same instant. */
  seq: number;
}

/**
 * When a version entered at `now` with this effective date comes into force:
 * 00:00 WIB on that date, or `now` itself when the date is today (so what was
 * in force earlier today is never rewritten).
 */
export function inForceFromFor(effectiveOn: string, now: Date): Date {
  const midnight = wib(effectiveOn);
  return midnight.getTime() < now.getTime() ? now : midnight;
}

/** Later in force wins; of two in force from the same instant, the later entry. */
function laterThan(a: VersionTimes, b: VersionTimes): boolean {
  const byTime = a.inForceFrom.getTime() - b.inForceFrom.getTime();
  return byTime > 0 || (byTime === 0 && a.seq > b.seq);
}

/** The version in force at `at`, or null when none had come into force by then. */
export function inForceAt<V extends VersionTimes>(versions: readonly V[], at: Date): V | null {
  let found: V | null = null;
  for (const version of versions) {
    if (version.inForceFrom.getTime() > at.getTime()) continue;
    if (!found || laterThan(version, found)) found = version;
  }
  return found;
}

/** The next version to come into force after `at` (the scheduled change), or null when none is scheduled. */
export function nextAfter<V extends VersionTimes>(versions: readonly V[], at: Date): V | null {
  const later = versions.filter((version) => version.inForceFrom.getTime() > at.getTime());
  if (later.length === 0) return null;
  const firstInstant = Math.min(...later.map((version) => version.inForceFrom.getTime()));
  return inForceAt(later, new Date(firstInstant));
}
