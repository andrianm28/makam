import "server-only";
import { sql } from "drizzle-orm";
import { SystemClock } from "@/adapters/live/system-clock";
import { workerHeartbeat, type WorkerHeartbeat } from "@/domain/scheduler";
import type { AppEnvironment } from "@/lib/env";
import type { Clock } from "@/ports/clock";
import { serverRuntime } from "./runtime";

export interface HealthReport {
  ok: boolean;
  /** APP_ENV of this process (never a secret); null when the configuration could not be read. */
  environment: AppEnvironment | null;
  checkedAt: Date;
  database: { ok: boolean; error?: string };
  worker: WorkerHeartbeat | null;
}

/**
 * The Clock for a report made before the runtime exists (bad configuration, so
 * no adapters were wired): the same system Clock the composition root uses.
 */
const configurationErrorClock: Clock = new SystemClock();

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

/** DB connectivity plus the worker's last heartbeat (fresh = younger than `HEARTBEAT_FRESH_FOR_SECONDS`). */
export async function readHealth(): Promise<HealthReport> {
  let runtime;
  try {
    runtime = serverRuntime();
  } catch (error) {
    return {
      ok: false,
      environment: null,
      checkedAt: configurationErrorClock.now(),
      database: { ok: false, error: errorMessage(error, "configuration error") },
      worker: null,
    };
  }

  const { database, adapters } = runtime;
  const environment = runtime.env.APP_ENV;
  const checkedAt = adapters.clock.now();
  try {
    await database.db.execute(sql`select 1`);
  } catch (error) {
    return {
      ok: false,
      environment,
      checkedAt,
      database: { ok: false, error: errorMessage(error, "unreachable") },
      worker: null,
    };
  }

  const worker = await workerHeartbeat({ db: database.db }, checkedAt);
  return { ok: worker.isFresh, environment, checkedAt, database: { ok: true }, worker };
}
