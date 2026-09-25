/**
 * Clock port: the only source of "now".
 *
 * Every deadline, due date, reminder window (08:00-20:00 WIB), working-hours
 * calculation and session expiry reads an injected Clock, never `new Date()`
 * or `Date.now()` directly. All wall-clock reasoning is in Asia/Jakarta (see
 * `@/lib/time/jakarta`); instants are plain `Date`s.
 */
export interface Clock {
  now(): Date;
}
