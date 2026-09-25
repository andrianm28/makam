import { eq, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { schedulerHeartbeat } from "./schema";

const WORKER = "worker";

/** A heartbeat older than this means the worker is not running its ticks. */
export const HEARTBEAT_FRESH_FOR_SECONDS = 120;

export interface WorkerHeartbeat {
  lastBeatAt: Date | null;
  ageSeconds: number | null;
  isFresh: boolean;
}

/**
 * Records that the worker ran its ticks at `now`. Idempotent: a repeated or
 * late tick never moves the heartbeat back.
 */
export async function recordHeartbeat(db: Database, now: Date): Promise<void> {
  await db
    .insert(schedulerHeartbeat)
    .values({ worker: WORKER, beatAt: now })
    .onConflictDoUpdate({
      target: schedulerHeartbeat.worker,
      set: { beatAt: sql`greatest(${schedulerHeartbeat.beatAt}, excluded.beat_at)` },
    });
}

export async function readHeartbeat(db: Database, now: Date): Promise<WorkerHeartbeat> {
  const [row] = await db
    .select({ beatAt: schedulerHeartbeat.beatAt })
    .from(schedulerHeartbeat)
    .where(eq(schedulerHeartbeat.worker, WORKER));

  if (!row) return { lastBeatAt: null, ageSeconds: null, isFresh: false };

  const ageSeconds = Math.max(0, Math.floor((now.getTime() - row.beatAt.getTime()) / 1000));
  return {
    lastBeatAt: row.beatAt,
    ageSeconds,
    isFresh: ageSeconds < HEARTBEAT_FRESH_FOR_SECONDS,
  };
}
