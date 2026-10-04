import { afterAll, describe, expect, it, vi } from "vitest";
import { testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { close } = testDatabase();
afterAll(close);
// What the host gives the web process: makam-deploy passes the commit its image was built from as SENTRY_RELEASE,
// and the release number the host has opened as RILIS_TERBUKA. Set before the runtime reads them.
const RELEASE = "0123456789abcdef0123456789abcdef01234567";
vi.stubEnv("SENTRY_RELEASE", RELEASE);
vi.stubEnv("RILIS_TERBUKA", "2");
testServerRuntime();

describe("GET /api/health", () => {
  it("names the environment it runs in, so staging can be told apart from production without reading its env", async () => {
    const response = await GET();
    const body = await response.json();
    expect(body.environment).toBe("test");
    expect(body.database).toEqual({ ok: true });
  });

  it("names the commit it runs (SENTRY_RELEASE), so the staging smoke test can tell which Deployment it is looking at", async () => {
    const body = await (await GET()).json();
    expect(body.release).toBe(RELEASE);
  });

  it("names the release number the host has opened (RILIS_TERBUKA), so what is open on production can be read without its env", async () => {
    const body = await (await GET()).json();
    expect(body.rilisTerbuka).toBe(2);
  });

  it("holds no secret: the body is the known fields and nothing from the environment", async () => {
    const body = await (await GET()).json();
    expect(Object.keys(body).sort()).toEqual(["checkedAt", "database", "environment", "ok", "release", "rilisTerbuka", "worker"]);
  });
});
