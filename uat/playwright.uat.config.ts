import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { bacaKonfigurasi } from "./support/lingkungan";

/*
 * The UAT runner (ticket 110, `npm run uat`): scripted journeys against staging
 * (https://dev.makam.co.id) or a local stack, with the owner reading out the
 * codes. It is not the e2e suite: its own testDir, never run by CI or by
 * `npm run e2e`. The base URL is refused unless it is staging or local, so it can
 * never be pointed at production. See uat/README.md.
 */

function sha(): string {
  const diberi = process.env.UAT_SHA?.trim();
  if (diberi) return diberi;
  try {
    return execFileSync("git", ["rev-parse", "--short=8", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "tanpa-sha";
  }
}

const konfigurasi = bacaKonfigurasi(process.env, { sekarang: new Date(), sha: sha() });
// The main process fixes the run folder once; every worker it starts inherits it.
process.env.UAT_OUT = konfigurasi.out;
process.env.UAT_SESI_DIR = konfigurasi.sesiDir;

export default defineConfig({
  testDir: "./perjalanan",
  testMatch: "**/*.uat.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  // A journey waits for the owner to read a code out (UAT_KODE_TIMEOUT_MENIT, 15 min by default) more than once.
  timeout: 60 * 60_000,
  expect: { timeout: 15_000 },
  outputDir: join(konfigurasi.out, "artefak"),
  reporter: [
    ["list"],
    ["html", { outputFolder: join(konfigurasi.out, "laporan"), open: "never" }],
    ["./support/ringkasan.ts", { out: konfigurasi.out, baseUrl: konfigurasi.baseUrl }],
  ],
  use: {
    baseURL: konfigurasi.baseUrl,
    httpCredentials: konfigurasi.basicAuth,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
    // Every step takes its own screenshot (support/langkah.ts).
    screenshot: "off",
    video: "off",
    // Proof photos are taken with the browser camera: Chromium's fake camera stands in for it.
    launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
