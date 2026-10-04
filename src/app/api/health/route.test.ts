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
      vi.unstubAllEnvs();
    });

    it("names the running commit and the open Rilis so a promotion can be checked from outside", async () => {
      vi.stubEnv("SENTRY_RELEASE", "abc1234def5678");
      vi.stubEnv("RILIS_TERBUKA", "2");
      const body = await (await GET()).json();
      expect(body.release).toBe("abc1234def5678");
      expect(body.rilisTerbuka).toBe(2);
    });

    it.each([["with spaces", "abc 123"], ["too long", "a".repeat(100)]])("reports no commit when the value is invalid (%s)", async (_n, value) => {
      vi.stubEnv("SENTRY_RELEASE", value);
      expect((await (await GET()).json()).release).toBeNull();
    });

    it("reports no commit when none was set and the Rilis the environment defaults to", async () => {
      const body = await (await GET()).json();
      expect(body.release).toBeNull();
      expect(body.rilisTerbuka).toBe(3);
    });
  });
});
