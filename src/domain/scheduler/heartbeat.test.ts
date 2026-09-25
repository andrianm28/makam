import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "@/adapters/memory/fake-clock";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../tests/support/database";
import { heartbeatTick, workerHeartbeat } from "./index";

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);

describe("Worker heartbeat", () => {
  it("has no heartbeat before the worker's first tick", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));

    const heartbeat = await workerHeartbeat({ db }, clock.now());

    expect(heartbeat).toEqual({ lastBeatAt: null, ageSeconds: null, isFresh: false });
  });

  it("is fresh right after a tick and for 2 minutes after it", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    await heartbeatTick({ db }, clock.now());

    expect(await workerHeartbeat({ db }, clock.now())).toEqual({
      lastBeatAt: wib("2026-10-01 09:00"),
      ageSeconds: 0,
      isFresh: true,
    });

    clock.advance({ minutes: 1, seconds: 59 });
    expect(await workerHeartbeat({ db }, clock.now())).toMatchObject({
      ageSeconds: 119,
      isFresh: true,
    });
  });

  it("goes stale once 2 minutes pass without a tick", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    await heartbeatTick({ db }, clock.now());

    clock.advance({ minutes: 2 });

    expect(await workerHeartbeat({ db }, clock.now())).toMatchObject({
      ageSeconds: 120,
      isFresh: false,
    });
  });

  it("each tick moves the heartbeat to the tick's time", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    await heartbeatTick({ db }, clock.now());
    clock.advance({ minutes: 5 });
    await heartbeatTick({ db }, clock.now());

    expect(await workerHeartbeat({ db }, clock.now())).toEqual({
      lastBeatAt: wib("2026-10-01 09:05"),
      ageSeconds: 0,
      isFresh: true,
    });
  });

  it("running the same tick twice is harmless", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:00"));
    await heartbeatTick({ db }, clock.now());
    await heartbeatTick({ db }, clock.now());

    expect(await workerHeartbeat({ db }, clock.now())).toEqual({
      lastBeatAt: wib("2026-10-01 09:00"),
      ageSeconds: 0,
      isFresh: true,
    });
  });

  it("a late, out-of-order tick never moves the heartbeat back in time", async () => {
    const clock = new FakeClock(wib("2026-10-01 09:05"));
    await heartbeatTick({ db }, clock.now());
    await heartbeatTick({ db }, wib("2026-10-01 09:00"));

    expect(await workerHeartbeat({ db }, clock.now())).toMatchObject({
      lastBeatAt: wib("2026-10-01 09:05"),
    });
  });
});
