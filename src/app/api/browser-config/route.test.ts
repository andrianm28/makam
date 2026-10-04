import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { serverRuntime } from "@/server/runtime";
import { resetDatabase, testDatabase } from "../../../../tests/support/database";
import { adminPlatformOf } from "../../../../tests/support/identity";
import { newLokasiMitra, publishOnTestDatabase } from "../../../../tests/support/publish";
import { testServerRuntime } from "../../../../tests/support/server-runtime";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("next/server", () => ({ connection: async () => {} }));

const { db, close } = testDatabase();
afterAll(close);
beforeEach(resetDatabase);
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

  describe("contohAktif (Data Contoh, ticket 109)", () => {
    it("tells the browser no Data Contoh is active on a stack whose registry is empty", async () => {
      expect((await (await GET()).json()).contohAktif).toBe(false);
    });

    it("tells the browser Data Contoh is active while the registry holds an active entry, and not once it is retired", async () => {
      const setup = publishOnTestDatabase(db);
      const { actor: admin } = await adminPlatformOf(setup);
      const lokasiMitra = await newLokasiMitra(setup, admin, "Taman Contoh (Contoh)");
      const { dataContoh } = serverRuntime();
      await dataContoh.catat(admin, { kode: "rilis1/lokasi/taman-contoh", himpunan: "rilis1", jenis: "lokasi_mitra", entitasId: lokasiMitra.id, reason: "test" });
      expect((await (await GET()).json()).contohAktif).toBe(true);

      const dicabut = await dataContoh.cabut(admin, { reason: "test" });

      expect(dicabut.ok).toBe(true);
      expect((await (await GET()).json()).contohAktif).toBe(false);
    });

    it("says null, never a guess, when the registry cannot be read, and still serves the rest", async () => {
      process.env.NEXT_PUBLIC_SENTRY_DSN = stagingDsn;
      const runtime = serverRuntime();
      const asli = runtime.dataContoh;
      runtime.dataContoh = { ...asli, aktif: async () => { throw new Error("database tidak terjangkau"); } };
      try {
        expect(await (await GET()).json()).toMatchObject({ sentryDsn: stagingDsn, contohAktif: null });
      } finally {
        runtime.dataContoh = asli;
      }
    });
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
