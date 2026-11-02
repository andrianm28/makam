import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { heartbeatTick } from "@/domain/scheduler";
import { wib } from "@/lib/time/jakarta";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { GET } from "./route";

/*
 * UAT penuh, worst case "the worker is down": the uptime alarm reads /api/health,
 * so a missing or stale worker heartbeat must answer 503 with ok false, and a
 * fresh one 200. (The UAT runner's pre-check still accepts a 503: it settles where
 * the stack is, not whether it is well.)
 */

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);
const { clock } = testServerRuntime();

describe("GET /api/health when the worker is down (UAT penuh, worst case)", () => {
  it("answers 503 with ok false when the worker has never beaten", async () => {
    clock.set(wib("2026-10-01 09:00"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, database: { ok: true }, worker: { fresh: false } });
  });

  it("answers 200 while the last heartbeat is fresh, and 503 once it is older than the fresh window", async () => {
    clock.set(wib("2026-10-01 09:00"));
    await heartbeatTick({ db }, clock.now());

    const segar = await GET();
    expect(segar.status).toBe(200);
    expect(await segar.json()).toMatchObject({ ok: true, worker: { fresh: true } });

    clock.set(wib("2026-10-01 09:10"));
    const basi = await GET();
    expect(basi.status).toBe(503);
    expect(await basi.json()).toMatchObject({ ok: false, worker: { fresh: false } });
    expect(basi.headers.get("cache-control")).toBe("no-store");
  });
});
