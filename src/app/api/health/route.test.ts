import { afterAll, describe, expect, it, vi } from "vitest";
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
});
