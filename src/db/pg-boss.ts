import { PgBoss } from "pg-boss";

/** The Postgres schema pg-boss keeps its queues, jobs and schedules in. */
export const PG_BOSS_SCHEMA = "pgboss";

export interface PgBossOptions {
  connectionString: string;
  /** Shown in pg_stat_activity, e.g. "makam-worker". */
  applicationName?: string;
  /** Install or upgrade the pg-boss schema. Only the `migrate` step does this. */
  migrate?: boolean;
  /** Run cron schedules (the worker only). */
  schedule?: boolean;
  /** Run queue maintenance (the worker only). */
  supervise?: boolean;
  /** Pool size. pg-boss's own default when unset. */
  max?: number;
  /** How often cron schedules are checked (seconds). pg-boss's own default when unset. */
  schedulerIntervalSeconds?: number;
}

/**
 * The one place a PgBoss is constructed, so every process agrees on the schema
 * and nothing migrates, schedules or supervises unless it asks to.
 */
export function createPgBoss(options: PgBossOptions): PgBoss {
  return new PgBoss({
    connectionString: options.connectionString,
    schema: PG_BOSS_SCHEMA,
    migrate: options.migrate ?? false,
    schedule: options.schedule ?? false,
    supervise: options.supervise ?? false,
    ...(options.applicationName ? { application_name: options.applicationName } : {}),
    ...(options.max ? { max: options.max } : {}),
    ...(options.schedulerIntervalSeconds
      ? {
          cronMonitorIntervalSeconds: options.schedulerIntervalSeconds,
          cronWorkerIntervalSeconds: options.schedulerIntervalSeconds,
        }
      : {}),
  });
}
