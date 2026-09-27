import { expect, test } from "@playwright/test";

/**
 * The staging smoke test (ticket 72): the short gate in front of production,
 * run from a hosted runner against the real https://dev.makam.co.id by
 * .github/workflows/staging-smoke.yml. Three pages, no login, no seeded data:
 * health, the public home and the Masuk page. Anything that needs an Akun
 * belongs in the e2e job against a throwaway stack, not here.
 *
 * Every title carries @smoke, and the e2e job skips those: the same checks
 * already run there against a freshly pushed image, and running them twice on
 * every push is not worth the minutes.
 *
 * The last one is the thing a shared image has to get right at runtime: the
 * browser DSN is served to the page, not baked into the bundle, so this
 * environment reports to its own GlitchTip.
 */
test("@smoke the health page reports the database and a fresh worker heartbeat", async ({ page }) => {
  await expect(async () => {
    await page.goto("/health");
    await expect(page.getByTestId("database-status")).toHaveText("OK", { timeout: 1_000 });
    await expect(page.getByTestId("worker-status")).toHaveText("OK", { timeout: 1_000 });
  }).toPass({ timeout: 90_000, intervals: [2_000] });
});

test("@smoke the public home page loads", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Makam\.co\.id/);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("@smoke the Masuk page asks for an email", async ({ page }) => {
  await page.goto("/masuk");
  await expect(page.getByRole("heading", { name: "Masuk" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kirim Kode Masuk" })).toBeEnabled();
});

test("@smoke the browser DSN is served at runtime, not baked into the image", async ({ page }) => {
  await page.goto("/");
  const dsn = await page.evaluate(() => window.__MAKAM_BROWSER_SENTRY_DSN__);
  // Set in staging.env, empty in development: either way the value comes in the
  // page, which is what lets one image serve both environments.
  expect(typeof dsn).toBe("string");
  if (dsn) expect(dsn).toMatch(/^https:\/\/[^@]+@glitchtip\.[^/]+\/\d+$/);
});
