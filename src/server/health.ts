import "server-only";
import { sql } from "drizzle-orm";
import { workerHeartbeat, type WorkerHeartbeat } from "@/domain/scheduler";
import { serverRuntime } from "./runtime";

export interface HealthReport {
  ok: boolean;
  checkedAt: Date;
  database: { ok: boolean; error?: string };
  worker: WorkerHeartbeat | null;
}

/** DB connectivity plus the worker's last heartbeat (fresh = younger than `HEARTBEAT_FRESH_FOR_SECONDS`). */
export async function readHealth(): Promise<HealthReport> {
  let runtime;
  try {
    runtime = serverRuntime();
  } catch (error) {
    return {
      ok: false,
      checkedAt: new Date(),
      database: { ok: false, error: error instanceof Error ? error.message : "configuration error" },
      worker: null,
    };
  }

  const { database, adapters } = runtime;
  const checkedAt = adapters.clock.now();
  try {
    await database.db.execute(sql`select 1`);
  } catch (error) {
    return {
      ok: false,
      checkedAt,
      database: { ok: false, error: error instanceof Error ? error.message : "unreachable" },
      worker: null,
    };
  }

  const worker = await workerHeartbeat({ db: database.db }, checkedAt);
  return { ok: worker.isFresh, checkedAt, database: { ok: true }, worker };
}
