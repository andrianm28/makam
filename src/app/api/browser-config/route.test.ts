import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { testDatabase } from "../../../../tests/support/database";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { close } = testDatabase();
afterAll(close);
testServerRuntime();

const stagingDsn = "https://stagingkey@glitchtip.makam.co.id/2";
const productionDsn = "https://productionkey@errors.makam.co.id/3";

describe("GET /api/browser-config", () => {
  const startedWith = process.env.NEXT_PUBLIC_SENTRY_DSN;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "";
  });
  afterEach(() => {
    if (startedWith === undefined) delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    else process.env.NEXT_PUBLIC_SENTRY_DSN = startedWith;
  });

  it("serves the DSN of the environment this process runs in, not one from the build", async () => {
    // The same image and the same build, two processes: what each one serves is
    // what it was started with. No build argument can put a value here.
    process.env.NEXT_PUBLIC_SENTRY_DSN = stagingDsn;
    expect(await (await GET()).json()).toEqual({ sentryDsn: stagingDsn });

    process.env.NEXT_PUBLIC_SENTRY_DSN = productionDsn;
    expect(await (await GET()).json()).toEqual({ sentryDsn: productionDsn });
  });

  it("serves an empty DSN when the environment set none, which turns browser reporting off", async () => {
    expect(await (await GET()).json()).toEqual({ sentryDsn: "" });
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(await (await GET()).json()).toEqual({ sentryDsn: "" });
  });

  it("is never cached: a proxy must not hand one environment's DSN to the other", async () => {
    expect((await GET()).headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a DSN that is not a URL, rather than reporting to nowhere", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "glitchtip";
    await expect(GET()).rejects.toThrow(/Invalid environment/);
  });
});
