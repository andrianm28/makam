import { expect, test } from "@playwright/test";

/**
 * Ticket 101: the trial-payment banner is for a production that pays through
 * SumoPod's sandbox. The local stack runs as development, so neither the banner
 * nor the Bayar notice may appear. The decision itself (production on the
 * sandbox shows, production live, staging and development hide) is a Vitest
 * case on `paymentsAreTrial`; this checks it does not leak onto the stack.
 */
for (const path of ["/", "/masuk"]) {
  test(`no trial-payment banner on ${path} in development`, async ({ page }) => {
    const config = page.waitForResponse((response) => response.url().endsWith("/api/browser-config"));
    await page.goto(path);
    const body = await (await config).json();
    expect(body.paymentTrial).toBe(false);
    await expect(page.getByRole("status").filter({ hasText: "PEMBAYARAN UJI COBA" })).toHaveCount(0);
    await expect(page.getByText("Pembayaran ini uji coba")).toHaveCount(0);
  });
}
