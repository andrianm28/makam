import { describe, expect, it } from "vitest";
import {
  BaseUrlDitolak,
  bacaKonfigurasi,
  checkoutSandboxSumopod,
  pastikanBaseUrlBoleh,
  pastikanLingkunganBoleh,
  permintaanKeProduksi,
  type AmbilHealth,
} from "../../uat/support/lingkungan";

/*
 * The UAT runner (uat/, `npm run uat`) pays and logs in on a real stack, so the
 * first thing it settles is where it may run: staging (https://dev.makam.co.id)
 * or a local stack, never production (ticket 110).
 */

describe("the UAT runner refuses any base URL other than staging or local", () => {
  it("accepts staging, with or without a trailing slash", () => {
    expect(pastikanBaseUrlBoleh("https://dev.makam.co.id")).toBe("https://dev.makam.co.id");
    expect(pastikanBaseUrlBoleh("https://dev.makam.co.id/")).toBe("https://dev.makam.co.id");
  });

  it("accepts a local stack on any port, over http", () => {
    expect(pastikanBaseUrlBoleh("http://127.0.0.1:3310")).toBe("http://127.0.0.1:3310");
    expect(pastikanBaseUrlBoleh("http://localhost:3310/")).toBe("http://localhost:3310");
    expect(pastikanBaseUrlBoleh("http://[::1]:3000")).toBe("http://[::1]:3000");
  });

  it.each([
    "https://makam.co.id",
    "https://www.makam.co.id",
    "https://makam.co.id/masuk",
    "https://staging.makam.co.id",
    "http://makam.co.id",
    "https://makam.co.id./",
    "https://www.makam.co.id./",
  ])("refuses production and every other makam.co.id host: %s", (url) => {
    expect(() => pastikanBaseUrlBoleh(url)).toThrow(BaseUrlDitolak);
  });

  it("names production in the refusal, so the person running it sees why", () => {
    expect(() => pastikanBaseUrlBoleh("https://makam.co.id")).toThrow(/produksi/i);
  });

  it.each([
    "https://dev.makam.co.id.evil.test",
    "https://evil.test/@dev.makam.co.id",
    "https://dev.makam.co.id@evil.test",
    "https://user:rahasia@dev.makam.co.id",
    "http://dev.makam.co.id",
    "https://dev.makam.co.id:8443",
    "https://dev.makam.co.id/staf",
    "https://localhost.evil.test",
    "http://127.0.0.1.nip.io",
    "https://dev.makam.co.id./",
    "http://10.0.0.5:3310",
    "not a url",
    "",
  ])("refuses a look-alike, a password in the URL and anything else that is not exactly staging or local: %s", (url) => {
    expect(() => pastikanBaseUrlBoleh(url)).toThrow(BaseUrlDitolak);
  });

  it("refuses when no base URL is given, instead of guessing one", () => {
    expect(() => pastikanBaseUrlBoleh(undefined)).toThrow(/UAT_BASE_URL/);
  });

  it("never asks for the password in the URL: basic auth comes from the environment", () => {
    expect(() => pastikanBaseUrlBoleh("https://user:rahasia@dev.makam.co.id")).toThrow(/UAT_BASIC_AUTH/);
  });
});

describe("a request the UAT runner's browser would make to production is caught, wherever a link leads", () => {
  it("flags makam.co.id and its subdomains other than staging", () => {
    expect(permintaanKeProduksi("https://makam.co.id/masuk")).toBe(true);
    expect(permintaanKeProduksi("https://www.makam.co.id/")).toBe(true);
    expect(permintaanKeProduksi("https://api.makam.co.id/x")).toBe(true);
  });

  it("lets staging, the local stack and the SumoPod sandbox checkout through", () => {
    expect(permintaanKeProduksi("https://dev.makam.co.id/masuk")).toBe(false);
    expect(permintaanKeProduksi("http://127.0.0.1:3310/health")).toBe(false);
    expect(permintaanKeProduksi("https://pay-sandbox.sumopod.com/checkout/abc")).toBe(false);
    expect(permintaanKeProduksi("https://api-pay-sandbox.sumopod.com/v1/payments")).toBe(false);
  });

  it("sees through a trailing dot, which is the same host: makam.co.id. is production, dev.makam.co.id. is staging", () => {
    expect(permintaanKeProduksi("https://makam.co.id./masuk")).toBe(true);
    expect(permintaanKeProduksi("https://www.makam.co.id./")).toBe(true);
    expect(permintaanKeProduksi("https://dev.makam.co.id./masuk")).toBe(false);
  });

  it("does not mistake a look-alike for staging", () => {
    expect(permintaanKeProduksi("https://makam.co.id.evil.test/")).toBe(false);
    expect(permintaanKeProduksi("https://evilmakam.co.id/")).toBe(false);
  });
});

describe("the UAT run's folder and credentials", () => {
  const staging = { UAT_BASE_URL: "https://dev.makam.co.id" };

  it("puts a run in /home/ubuntu/uat-runs/<WIB date>-<sha>, with the sessions beside it, not inside it", () => {
    // 2026-10-04 18:30 UTC is already 5 October in WIB (UTC+7).
    const konfigurasi = bacaKonfigurasi(staging, { sekarang: new Date("2026-10-04T18:30:00Z"), sha: "0fd6bf41" });
    expect(konfigurasi.out).toBe("/home/ubuntu/uat-runs/2026-10-05-0fd6bf41");
    expect(konfigurasi.sesiDir).toBe("/home/ubuntu/uat-runs/sesi");
  });

  it("takes the folder the orchestrator names in UAT_OUT, where it also writes the codes the owner reads out", () => {
    const konfigurasi = bacaKonfigurasi({ ...staging, UAT_OUT: "/home/ubuntu/uat-runs/rilis-1" }, { sekarang: new Date(), sha: "x" });
    expect(konfigurasi.out).toBe("/home/ubuntu/uat-runs/rilis-1");
  });

  it("reads basic auth from the environment, and only as a pair", () => {
    const sekarang = new Date("2026-10-04T00:00:00Z");
    const dengan = bacaKonfigurasi({ ...staging, UAT_BASIC_AUTH_USER: "makam", UAT_BASIC_AUTH_PASSWORD: "rahasia" }, { sekarang, sha: "x" });
    // `origin` keeps the password for staging alone: a host that challenges later (the SumoPod checkout) never gets it.
    expect(dengan.basicAuth).toEqual({ username: "makam", password: "rahasia", origin: "https://dev.makam.co.id" });
    expect(bacaKonfigurasi(staging, { sekarang, sha: "x" }).basicAuth).toBeUndefined();
    expect(() => bacaKonfigurasi({ ...staging, UAT_BASIC_AUTH_USER: "makam" }, { sekarang, sha: "x" })).toThrow(/berpasangan/);
  });

  it("refuses to build any configuration for production", () => {
    expect(() => bacaKonfigurasi({ UAT_BASE_URL: "https://makam.co.id" }, { sekarang: new Date(), sha: "x" })).toThrow(BaseUrlDitolak);
  });
});

describe("how long the runner waits for the owner's codes comes from the environment, and a bad value stops the run", () => {
  const staging = { UAT_BASE_URL: "https://dev.makam.co.id" };
  const opsi = { sekarang: new Date("2026-10-04T00:00:00Z"), sha: "x" };

  it("uses 10 minutes of patience for the hour's limit and 15 for a code to be read out when nothing is set, or the variable is empty", () => {
    expect(bacaKonfigurasi(staging, opsi)).toMatchObject({ kodeTungguMaksMenit: 10, kodeTimeoutMenit: 15 });
    expect(bacaKonfigurasi({ ...staging, UAT_KODE_TUNGGU_MAKS_MENIT: "", UAT_KODE_TIMEOUT_MENIT: " " }, opsi)).toMatchObject({
      kodeTungguMaksMenit: 10,
      kodeTimeoutMenit: 15,
    });
  });

  it("takes the minutes the owner gives", () => {
    expect(bacaKonfigurasi({ ...staging, UAT_KODE_TUNGGU_MAKS_MENIT: "65", UAT_KODE_TIMEOUT_MENIT: "30" }, opsi)).toMatchObject({
      kodeTungguMaksMenit: 65,
      kodeTimeoutMenit: 30,
    });
  });

  it.each(["abc", "0", "-5", "NaN", "Infinity", "1"])(
    "refuses %s for the patience: a value that is not a number, or below the 60 s gap itself, would turn every wait into a false 'five an hour' refusal or lift the cap",
    (nilai) => {
      expect(() => bacaKonfigurasi({ ...staging, UAT_KODE_TUNGGU_MAKS_MENIT: nilai }, opsi)).toThrow(/UAT_KODE_TUNGGU_MAKS_MENIT/);
    },
  );

  it.each(["abc", "0", "-1", "Infinity"])("refuses %s for the time a code may take to be read out", (nilai) => {
    expect(() => bacaKonfigurasi({ ...staging, UAT_KODE_TIMEOUT_MENIT: nilai }, opsi)).toThrow(/UAT_KODE_TIMEOUT_MENIT/);
  });
});

describe("the UAT runner asks the stack which environment it is, so a loopback port can never reach production", () => {
  /** A stack answering /api/health the way the app does; any other path is a 404 with no JSON. */
  function tumpukan(base: string, jawaban: { status?: number; isi?: unknown } | "mati", syarat?: { auth: string }): AmbilHealth {
    return async (url, init) => {
      if (jawaban === "mati") throw new Error("connect ECONNREFUSED");
      if (url !== `${base}/api/health`) return { status: 404, json: async () => ({}) };
      if (syarat && init.headers.authorization !== syarat.auth) return { status: 401, json: async () => ({}) };
      return { status: jawaban.status ?? 200, json: async () => jawaban.isi };
    };
  }

  it.each(["development", "test", "staging"])("accepts a stack that says it is %s", async (environment) => {
    const base = "http://127.0.0.1:3310";
    await expect(pastikanLingkunganBoleh(base, { ambil: tumpukan(base, { isi: { ok: true, environment } }) })).resolves.toBe(environment);
  });

  it("refuses a stack that says it is production, even on 127.0.0.1:3100, where production listens on the shared host", async () => {
    const base = "http://127.0.0.1:3100";
    const percobaan = pastikanLingkunganBoleh(base, { ambil: tumpukan(base, { isi: { ok: true, environment: "production" } }) });
    await expect(percobaan).rejects.toThrow(BaseUrlDitolak);
    await expect(percobaan).rejects.toThrow(/produksi/i);
  });

  it.each([
    ["no environment in the answer (its configuration could not be read, so it cannot be told from production)", { isi: { ok: false, environment: null }, status: 503 }],
    ["an environment it does not know", { isi: { environment: "preview" } }],
    ["an answer that is not the health report", { isi: "<html>nginx</html>" }],
    ["a 404 (not this app at all)", { status: 404, isi: {} }],
    ["no answer (the stack is down, or nothing listens there)", "mati" as const],
  ])("refuses to guess when it gets %s", async (_judul, jawaban) => {
    const base = "http://127.0.0.1:3310";
    await expect(pastikanLingkunganBoleh(base, { ambil: tumpukan(base, jawaban) })).rejects.toThrow(BaseUrlDitolak);
  });

  it("still runs against a staging whose worker beat is stale (503): it settles where the stack is, not whether it is well", async () => {
    const base = "https://dev.makam.co.id";
    const diterima = await pastikanLingkunganBoleh(base, { ambil: tumpukan(base, { status: 503, isi: { ok: false, environment: "staging" } }) });
    expect(diterima).toBe("staging");
  });

  it("gives staging's basic auth to the health check when the runner has it", async () => {
    const base = "https://dev.makam.co.id";
    const auth = `Basic ${Buffer.from("makam:rahasia").toString("base64")}`;
    const ambil = tumpukan(base, { isi: { environment: "staging" } }, { auth });
    await expect(pastikanLingkunganBoleh(base, { ambil, basicAuth: { username: "makam", password: "rahasia" } })).resolves.toBe("staging");
    await expect(pastikanLingkunganBoleh(base, { ambil })).rejects.toThrow(BaseUrlDitolak);
  });
});

describe("the SumoPod checkout the runner pays on is the sandbox, by its exact host", () => {
  it("is pay-sandbox.sumopod.com and nothing else under sumopod.com", () => {
    expect(checkoutSandboxSumopod("https://pay-sandbox.sumopod.com/checkout/abc")).toBe(true);
    expect(checkoutSandboxSumopod("https://pay.sumopod.com/checkout/abc")).toBe(false);
    expect(checkoutSandboxSumopod("https://www.sumopod.com/")).toBe(false);
    expect(checkoutSandboxSumopod("https://pay-sandbox.sumopod.com.evil.test/")).toBe(false);
    expect(checkoutSandboxSumopod("https://evilsumopod.com/")).toBe(false);
    expect(checkoutSandboxSumopod("not a url")).toBe(false);
  });
});
