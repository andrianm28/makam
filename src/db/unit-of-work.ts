import type pg from "pg";
import type { PgBoss } from "pg-boss";
import { databaseOn, type Database } from "./client";

export interface EnqueueOptions {
  /** Run no earlier than this instant (e.g. a deadline read from the Clock). */
  startAfter?: Date;
  /** At most one queued job per key (pg-boss singleton). */
  singletonKey?: string;
}

/** What a domain module sees of the job queue: enqueue only. */
export interface JobQueue {
  enqueue(name: string, data: object, options?: EnqueueOptions): Promise<void>;
}

export interface UnitOfWork {
  /** The transaction's Database: pass it to domain functions. */
  db: Database;
  /** Enqueues jobs inside the same transaction: they exist only if it commits. */
  jobs: JobQueue;
}

/**
 * Runs `work` in one Postgres transaction whose jobs are enqueued through the
 * same connection, so data and jobs commit or roll back together (no Redis, no
 * outbox). Rolls back and rethrows when `work` throws.
 */
export async function inTransaction<T>(
  deps: { pool: pg.Pool; boss: Pick<PgBoss, "send"> },
  work: (uow: UnitOfWork) => Promise<T>,
): Promise<T> {
  const client = await deps.pool.connect();
  try {
    await client.query("begin");
    const executor = {
      executeSql: (text: string, values?: unknown[]) => client.query(text, values as unknown[]),
    };
    const jobs: JobQueue = {
      async enqueue(name, data, options = {}) {
        await deps.boss.send(name, data, { ...options, db: executor });
      },
    };
    const result = await work({ db: databaseOn(client), jobs });
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
