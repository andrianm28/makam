import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { close } = testDatabase();
afterAll(close);
testServerRuntime();

describe("GET /api/health", () => {
  it("names the environment it runs in, so staging can be told apart from production without reading its env", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.environment).toBe("test");
    expect(body.database).toEqual({ ok: true });
  });

  describe("the release this process runs", () => {
    afterEach(() => {
      delete process.env.SENTRY_RELEASE;
      delete process.env.RILIS_TERBUKA;
    });

    it("names the running commit and the open Rilis so a promotion can be checked from outside", async () => {
      process.env.SENTRY_RELEASE = "abc1234def5678";
      process.env.RILIS_TERBUKA = "2";
      const body = await (await GET()).json();
      expect(body.release).toBe("abc1234def5678");
      expect(body.rilisTerbuka).toBe(2);
    });

    it("reports no commit when none was set and the Rilis the environment defaults to", async () => {
      const body = await (await GET()).json();
      expect(body.release).toBeNull();
      expect(body.rilisTerbuka).toBe(3);
    });
  });
});
