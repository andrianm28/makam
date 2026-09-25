import type { PgBoss } from "pg-boss";
import { createPgBoss } from "@/db/pg-boss";
import type { Database } from "@/db/client";
import type { ScheduledTick } from "@/domain/scheduler";
import { JAKARTA_TIME_ZONE } from "@/lib/time/jakarta";
import type { Clock } from "@/ports/clock";

export interface WorkerOptions {
  connectionString: string;
  db: Database;
  clock: Clock;
  ticks: readonly ScheduledTick[];
  /** Tests only: run every tick on this cron instead of its own. */
  cronOverride?: string;
  /** How often pg-boss checks schedules (seconds). Default 30. */
  schedulerIntervalSeconds?: number;
  /** How often each queue is polled (seconds). Default 2. */
  pollingIntervalSeconds?: number;
  onError?: (error: unknown, context: { job?: string }) => void;
}

export interface RunningWorker {
  boss: PgBoss;
  stop(): Promise<void>;
}

/**
 * The worker process: pg-boss consumers and schedules, nothing else.
 *
 * Each ScheduledTick becomes a queue, a cron schedule in Asia/Jakarta and a
 * consumer that calls `tick(ctx, clock.now())`. All state lives in Postgres,
 * so a restart loses no timer (story 186). pg-boss schema changes are not made
 * here; `migrate` installs them.
 */
export async function startWorker(options: WorkerOptions): Promise<RunningWorker> {
  const boss = createPgBoss({
    connectionString: options.connectionString,
    applicationName: "makam-worker",
    schedule: true,
    supervise: true,
    schedulerIntervalSeconds: options.schedulerIntervalSeconds,
  });
  boss.on("error", (error) => options.onError?.(error, {}));

  await boss.start();

  const wanted = new Set(options.ticks.map((t) => t.name));
  for (const schedule of await boss.getSchedules()) {
    if (!wanted.has(schedule.name)) await boss.unschedule(schedule.name, schedule.key);
  }

  for (const scheduled of options.ticks) {
    await boss.createQueue(scheduled.name);
    await boss.schedule(scheduled.name, options.cronOverride ?? scheduled.cron, null, {
      tz: JAKARTA_TIME_ZONE,
      // A tick is idempotent, so retrying a failed run is safe.
      retryLimit: 2,
      expireInSeconds: 5 * 60,
    });
    await boss.work(
      scheduled.name,
      { pollingIntervalSeconds: options.pollingIntervalSeconds ?? 2 },
      async () => {
        try {
          await scheduled.tick({ db: options.db }, options.clock.now());
        } catch (error) {
          options.onError?.(error, { job: scheduled.name });
          throw error;
        }
      },
    );
  }

  return {
    boss,
    stop: () => boss.stop({ graceful: true, timeout: 10_000 }),
  };
}
