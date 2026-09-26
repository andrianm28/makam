import { afterAll, afterEach, beforeEach, describe, expect, inject, it } from "vitest";
import { SystemClock } from "@/adapters/live/system-clock";
import { paymentEffects } from "@/composition/billing";
import { scheduledTicks, workerHeartbeat } from "@/domain/scheduler";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { startWorker, type RunningWorker } from "./runtime";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

let worker: RunningWorker | undefined;
afterEach(async () => {
  await worker?.stop();
  worker = undefined;
});

async function eventually<T>(read: () => Promise<T>, done: (value: T) => boolean, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (done(value) || Date.now() > deadline) return value;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

describe("pg-boss wiring (smoke)", () => {
  it("runs the scheduled heartbeat tick end to end: schedule -> job -> tick -> heartbeat", async () => {
    const clock = new SystemClock();
    expect((await workerHeartbeat({ db }, clock.now())).lastBeatAt).toBeNull();

    worker = await startWorker({
      connectionString: inject("databaseUrl"),
      context: { db, paymentEffects: paymentEffects(), reportError: () => {} },
      clock,
      ticks: scheduledTicks,
      // Same registry and wiring as production; only the cadence is faster
      // (every second instead of every minute) so the test stays quick.
      cronOverride: "* * * * * *",
      schedulerIntervalSeconds: 1,
      pollingIntervalSeconds: 0.5,
    });

    const heartbeat = await eventually(
      () => workerHeartbeat({ db }, clock.now()),
      (h) => h.isFresh,
      20_000,
    );

    expect(heartbeat.isFresh).toBe(true);
    expect(heartbeat.ageSeconds).toBeLessThan(5);
  }, 30_000);
});
