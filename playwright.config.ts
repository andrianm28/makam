import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running stack (web + worker + Postgres), by
 * default the local compose stack: `docker compose -p makam-v1-dev up -d`.
 * On `main`, CI runs them against the pushed image (.github/workflows/ci.yml,
 * job `e2e`) and keeps test-results/ (traces, screenshots) when one fails.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3310",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
