import { expect, test } from "@playwright/test";

/**
 * Ticket 101: the trial-payment banner is for a production that pays through
 * SumoPod's sandbox. The local stack runs as development, so neither the banner
 * nor the Bayar notice may appear. The decision itself (production on the
 * sandbox shows, production live, staging and development hide) is a Vitest
 * case on `paymentsAreTrial`; this checks it does not leak onto the stack.
 *
 * Ticket 109: while Data Contoh is active the banner adds a second line. The
 * stack is development with an empty registry, so there the line must not show
 * either; its two states are checked on the page by answering
 * `/api/browser-config` as a trial production would (what the server decides is a
 * Vitest case on the route and on `barisBanner`).
 */
for (const path of ["/", "/masuk"]) {
  test(`no trial-payment banner on ${path} in development`, async ({ page }) => {
    const config = page.waitForResponse((response) => response.url().endsWith("/api/browser-config"));
    await page.goto(path);
    const body = await (await config).json();
    expect(body.paymentTrial).toBe(false);
    expect(body.contohAktif).toBe(false);
    await expect(page.getByRole("status").filter({ hasText: "PEMBAYARAN UJI COBA" })).toHaveCount(0);
    await expect(page.getByText("Pembayaran ini uji coba")).toHaveCount(0);
    await expect(page.getByText("Data bertanda (Contoh)")).toHaveCount(0);
  });
}

const CONTOH = "Data bertanda (Contoh) dan harganya adalah contoh; pesanan masa uji coba tidak dilayani sungguhan.";

test("the trial banner adds the Data Contoh line while Data Contoh is active", async ({ page }) => {
  await page.route("**/api/browser-config", (route) => route.fulfill({ json: { sentryDsn: "", paymentTrial: true, contohAktif: true } }));
  await page.goto("/");
  const banner = page.getByRole("status").filter({ hasText: "PEMBAYARAN UJI COBA" });
  await expect(banner).toBeVisible();
  await expect(banner.getByText(CONTOH)).toBeVisible();
});

test("the trial banner has no Data Contoh line once Data Contoh is gone", async ({ page }) => {
  await page.route("**/api/browser-config", (route) => route.fulfill({ json: { sentryDsn: "", paymentTrial: true, contohAktif: false } }));
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "PEMBAYARAN UJI COBA" })).toBeVisible();
  await expect(page.getByText("Data bertanda (Contoh)")).toHaveCount(0);
});

test("no Data Contoh line without the trial banner, whatever the registry says", async ({ page }) => {
  await page.route("**/api/browser-config", (route) => route.fulfill({ json: { sentryDsn: "", paymentTrial: false, contohAktif: true } }));
  await page.goto("/");
  await expect(page.getByRole("status").filter({ hasText: "PEMBAYARAN UJI COBA" })).toHaveCount(0);
  await expect(page.getByText("Data bertanda (Contoh)")).toHaveCount(0);
});
