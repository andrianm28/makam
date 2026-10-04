import { describe, expect, it } from "vitest";
import { BaseUrlDitolak, bacaKonfigurasi, pastikanBaseUrlBoleh, permintaanKeProduksi } from "../../uat/support/lingkungan";

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
    expect(pastikanBaseUrlBoleh("http://localhost:3100/")).toBe("http://localhost:3100");
    expect(pastikanBaseUrlBoleh("http://[::1]:3000")).toBe("http://[::1]:3000");
  });

  it.each([
    "https://makam.co.id",
    "https://www.makam.co.id",
    "https://makam.co.id/masuk",
    "https://staging.makam.co.id",
    "http://makam.co.id",
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
    expect(dengan.basicAuth).toEqual({ username: "makam", password: "rahasia" });
    expect(bacaKonfigurasi(staging, { sekarang, sha: "x" }).basicAuth).toBeUndefined();
    expect(() => bacaKonfigurasi({ ...staging, UAT_BASIC_AUTH_USER: "makam" }, { sekarang, sha: "x" })).toThrow(/berpasangan/);
  });

  it("refuses to build any configuration for production", () => {
    expect(() => bacaKonfigurasi({ UAT_BASE_URL: "https://makam.co.id" }, { sekarang: new Date(), sha: "x" })).toThrow(BaseUrlDitolak);
  });
});
