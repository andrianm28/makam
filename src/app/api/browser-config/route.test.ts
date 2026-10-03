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
    expect(await (await GET()).json()).toMatchObject({ sentryDsn: stagingDsn });

    process.env.NEXT_PUBLIC_SENTRY_DSN = productionDsn;
    expect(await (await GET()).json()).toMatchObject({ sentryDsn: productionDsn });
  });

  it("serves an empty DSN when the environment set none, which turns browser reporting off", async () => {
    expect(await (await GET()).json()).toMatchObject({ sentryDsn: "" });
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    expect(await (await GET()).json()).toMatchObject({ sentryDsn: "" });
  });

  it("is never cached: a proxy must not hand one environment's DSN to the other", async () => {
    expect((await GET()).headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a DSN that is not a URL, rather than reporting to nowhere", async () => {
    process.env.NEXT_PUBLIC_SENTRY_DSN = "glitchtip";
    await expect(GET()).rejects.toThrow(/Invalid environment/);
  });

  describe("paymentTrial", () => {
    const keys = ["APP_ENV", "SUMOPOD_BASE_URL"] as const;
    const before = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
    afterEach(() => {
      for (const k of keys) {
        if (before[k] === undefined) delete process.env[k];
        else process.env[k] = before[k];
      }
    });

    it("tells the browser payments are a trial while production pays through the sandbox", async () => {
      process.env.APP_ENV = "production";
      process.env.SUMOPOD_BASE_URL = "https://api-pay-sandbox.sumopod.com";
      expect((await (await GET()).json()).paymentTrial).toBe(true);
    });

    it("tells the browser payments are not a trial on production paying live, and on staging", async () => {
      process.env.APP_ENV = "production";
      delete process.env.SUMOPOD_BASE_URL;
      expect((await (await GET()).json()).paymentTrial).toBe(false);
      process.env.APP_ENV = "staging";
      process.env.SUMOPOD_BASE_URL = "https://api-pay-sandbox.sumopod.com";
      expect((await (await GET()).json()).paymentTrial).toBe(false);
    });
  });
});
