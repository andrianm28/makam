import type { Clock } from "@/ports/clock";

export interface Duration {
  days?: number;
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

export function durationMs(duration: Duration): number {
  return (
    (duration.days ?? 0) * 86_400_000 +
    (duration.hours ?? 0) * 3_600_000 +
    (duration.minutes ?? 0) * 60_000 +
    (duration.seconds ?? 0) * 1_000 +
    (duration.milliseconds ?? 0)
  );
}

/** A Clock that only moves when a test moves it. */
export class FakeClock implements Clock {
  #now: number;

  constructor(start: Date) {
    this.#now = start.getTime();
  }

  now(): Date {
    return new Date(this.#now);
  }

  set(to: Date): void {
    this.#now = to.getTime();
  }

  advance(by: Duration): void {
    this.#now += durationMs(by);
  }
}
