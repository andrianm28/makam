import type { Database } from "@/db/client";
import type { Clock } from "@/ports/clock";

/**
 * The driver both queued-alert send ticks share (ticket 96; Peringatan Antrean
 * and Peringatan Staf): every not-yet-done, due row is handled in a transaction
 * of its own, taken `FOR UPDATE SKIP LOCKED`, so two workers never send the same
 * alert and an alert that throws (its own failed attempt, recorded) neither
 * rolls back nor blocks the others. Idempotent: a done or given-up row is never
 * picked up again, and a failed one waits for its backoff.
 *
 * The caller owns what a row is and how it is sent; this owns only the loop.
 */
export async function jalankanTickAntrean<TRow>(opts: {
  db: Database;
  clock: Clock;
  /** The not-yet-done, due rows, oldest first. */
  due: (now: Date) => Promise<{ id: string }[]>;
  /** Handles one row in its own transaction; returns how many channels went out. */
  proses: (tx: Database, id: string, now: Date) => Promise<number>;
  /** Re-reads one row under lock; empty when another worker took it or it is done. */
  lockDue: (tx: Database, id: string, now: Date) => Promise<TRow[]>;
  /** Records a failed attempt: counted, and either scheduled again or given up. */
  catatKegagalan: (tx: Database, item: TRow, now: Date) => Promise<void>;
}): Promise<{ dikirim: number }> {
  const now = opts.clock.now();
  const due = await opts.due(now);
  let dikirim = 0;
  for (const { id } of due) {
    try {
      dikirim += await opts.db.transaction((tx) => opts.proses(tx, id, now));
    } catch {
      // The send itself threw (a words check, a staff page, a port): that is this
      // alert's failed attempt, kept apart from the others.
      await opts.db.transaction(async (tx) => {
        const [item] = await opts.lockDue(tx, id, now);
        if (item) await opts.catatKegagalan(tx, item, now);
      });
    }
  }
  return { dikirim };
}
