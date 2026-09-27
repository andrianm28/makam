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
 * browser DSN is served by the running server, not baked into the bundle, so
 * this environment reports to its own GlitchTip.
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
  // The DSN is a runtime value, and this page is statically rendered: its HTML is
  // written at build time, where the image has no environment at all. So the
  // served page must carry no DSN whatsoever, and the browser must get it from the
  // process that is serving it.
  const html = await page.content();
  expect(html).not.toContain("__MAKAM_BROWSER_SENTRY_DSN__");
  // Any DSN shape at all, whichever host this environment uses.
  expect(html).not.toMatch(/https:\/\/[^@"'\s]+@[^/\s"']+\/\d+/);

  // What the page itself asks the server for. Asked from inside the page, so it
  // goes over the same connection (and the same basic auth) as the page itself.
  const served = await page.evaluate(async () => {
    const response = await fetch("/api/browser-config");
    return (await response.json()) as { sentryDsn: string };
  });
  expect(typeof served.sentryDsn).toBe("string");

  // And what the browser ended up with, once that request came back. A static
  // page cannot have inlined it, so this can only be the server's own value.
  await expect
    .poll(() => page.evaluate(() => window.__MAKAM_BROWSER_SENTRY_DSN__), { timeout: 10_000 })
    .toBe(served.sentryDsn);

  // The hosted gate runs against dev.makam.co.id, where the DSN is set; the CI
  // e2e stack sets none, and there an empty DSN is the correct answer (it turns
  // browser reporting off rather than reporting to nowhere).
  const isTheRealSite = !["127.0.0.1", "localhost"].includes(new URL(page.url()).hostname);
  if (isTheRealSite) {
    expect(served.sentryDsn).toMatch(/^https:\/\/[^@]+@[^/]+\/\d+$/);
  }
});
