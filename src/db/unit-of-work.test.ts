import { afterAll, beforeAll, beforeEach, describe, expect, inject, it } from "vitest";
import { SystemClock } from "@/adapters/live/system-clock";
import { heartbeatTick, workerHeartbeat } from "@/domain/scheduler";
import { resetDatabase, testDatabase } from "../../tests/support/database";
import { createPgBoss } from "./pg-boss";
import { inTransaction } from "./unit-of-work";

const QUEUE = "test.unit-of-work";
const { db, pool, close } = testDatabase();
const boss = createPgBoss({ connectionString: inject("databaseUrl"), max: 2 });

beforeAll(async () => {
  await boss.start();
  await boss.createQueue(QUEUE);
});
afterAll(async () => {
  await boss.deleteQueue(QUEUE);
  await boss.stop({ graceful: false });
  await close();
});
beforeEach(async () => {
  await resetDatabase();
  await boss.deleteAllJobs(QUEUE);
});

const now = () => new SystemClock().now();

describe("enqueueing a job in the same transaction as the data", () => {
  it("commits the data and the job together", async () => {
    await inTransaction({ pool, boss }, async ({ db: tx, jobs }) => {
      await heartbeatTick({ db: tx }, now());
      await jobs.enqueue(QUEUE, { reason: "committed" });
    });

    expect((await workerHeartbeat({ db }, now())).lastBeatAt).not.toBeNull();
    const [job] = await boss.fetch<{ reason: string }>(QUEUE);
    expect(job?.data).toEqual({ reason: "committed" });
  });

  it("rolls back the job with the data when the transaction fails", async () => {
    await expect(
      inTransaction({ pool, boss }, async ({ db: tx, jobs }) => {
        await heartbeatTick({ db: tx }, now());
        await jobs.enqueue(QUEUE, { reason: "rolled back" });
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    expect((await workerHeartbeat({ db }, now())).lastBeatAt).toBeNull();
    expect(await boss.fetch(QUEUE)).toEqual([]);
  });
});
