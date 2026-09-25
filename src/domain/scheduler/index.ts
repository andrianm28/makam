/**
 * Scheduler module.
 *
 * Owns the tick registry: every recurring piece of worker behaviour is a
 * domain tick function `tick(ctx, now)` that takes "now" from the Clock and
 * acts on the database state due at that time. The `worker` process is only
 * a thin pg-boss wrapper around these ticks, so a restart never loses a timer
 * (story 186) and tests call ticks directly with the fake Clock.
 *
 * Every tick must be idempotent: running it twice for the same `now` is harmless.
 *
 * Owns table: scheduler_heartbeat.
 */
import type { Database } from "@/db/client";
import { pruneIpRequests } from "@/domain/identity";
import { readHeartbeat, recordHeartbeat, type WorkerHeartbeat } from "./heartbeat";

export { HEARTBEAT_FRESH_FOR_SECONDS, type WorkerHeartbeat } from "./heartbeat";

export interface SchedulerContext {
  db: Database;
}

export type TickFunction = (ctx: SchedulerContext, now: Date) => Promise<void>;

export interface ScheduledTick {
  /** pg-boss queue name. */
  name: string;
  /** Cron expression, evaluated in Asia/Jakarta. */
  cron: string;
  tick: TickFunction;
}

/** The worker's heartbeat tick: proves the scheduler is alive. */
export async function heartbeatTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await recordHeartbeat(ctx.db, now);
}

/** The worker's last heartbeat as seen at `now`; fresh while younger than `HEARTBEAT_FRESH_FOR_SECONDS`. */
export async function workerHeartbeat(ctx: SchedulerContext, now: Date): Promise<WorkerHeartbeat> {
  return readHeartbeat(ctx.db, now);
}

/**
 * Every tick the worker schedules. Later tickets add theirs here (hold expiry,
 * reminders, Antrean escalations, Pencairan due, ...).
 */
export const scheduledTicks: readonly ScheduledTick[] = [
  { name: "scheduler.heartbeat", cron: "* * * * *", tick: heartbeatTick },
  // Identity & Access: per-IP request records for emailed codes older than 24 h (ticket 67).
  { name: "identity.prune_ip_requests", cron: "17 * * * *", tick: pruneIpRequestsTick },
];

async function pruneIpRequestsTick(ctx: SchedulerContext, now: Date): Promise<void> {
  await pruneIpRequests(ctx, now);
}
