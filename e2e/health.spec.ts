import { expect, test } from "@playwright/test";

test("/health shows the database OK and a fresh worker heartbeat", async ({ page }) => {
  // The worker's first heartbeat lands at the next minute boundary after start,
  // so allow a freshly started stack up to 90 s to report it.
  await expect(async () => {
    await page.goto("/health");
    await expect(page.getByTestId("database-status")).toHaveText("OK", { timeout: 1_000 });
    await expect(page.getByTestId("worker-status")).toHaveText("OK", { timeout: 1_000 });
  }).toPass({ timeout: 90_000, intervals: [2_000] });

  await expect(page.getByText("System health")).toBeVisible();
  await expect(page.getByTestId("worker-heartbeat")).toHaveText(/\d{2}\/\d{2}\/\d{4} \d{2}\.\d{2}\.\d{2} WIB \(\d+ s ago\)/);
});
