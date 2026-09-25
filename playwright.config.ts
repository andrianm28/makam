import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a running stack (web + worker + Postgres), by
 * default the local compose stack: `docker compose -p makam-v1-dev up -d`.
 */
export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3310",
    trace: "retain-on-failure",
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /lokasi\.spec\.ts/ },
    // Specs that start from the Admin Platform staf.spec seeded (its saved browser state, e2e/support/masuk.ts).
    { name: "staf-lanjutan", use: { ...devices["Desktop Chrome"] }, testMatch: /lokasi\.spec\.ts/, dependencies: ["chromium"] },
  ],
});
