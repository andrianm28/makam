import { expect, test, type Page } from "@playwright/test";

/**
 * The staging banner is decided in the browser from the page's host. To serve
 * the local stack under the staging host, Chromium resolves dev.makam.co.id to
 * the stack's address (plain http, as the local stack has no TLS).
 */
const stack = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3310");
const stagingOrigin = `http://dev.makam.co.id:${stack.port || "80"}`;

// Only remaps dev.makam.co.id, so the other tests still reach the stack by its own address.
test.use({
  launchOptions: { args: [`--host-resolver-rules=MAP dev.makam.co.id ${stack.hostname}`] },
});

const BANNER_TEXT =
  "STAGING — bukan layanan resmi Makam.co.id. Data dan pembayaran di sini hanya untuk uji coba.";
const pages = ["/", "/masuk", "/health"];

function banner(page: Page) {
  return page.getByRole("status").filter({ hasText: "STAGING" });
}

test.describe("on the local stack (development)", () => {
  for (const path of pages) {
    test(`no staging banner on ${path}`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expect(page.getByText("STAGING")).toHaveCount(0);
    });
  }
});

test.describe("on the staging host dev.makam.co.id", () => {
  for (const path of pages) {
    test(`the staging banner shows on ${path}`, async ({ page }) => {
      await page.goto(`${stagingOrigin}${path}`);
      await expect(banner(page)).toHaveText(BANNER_TEXT);
    });
  }

  test("the staging banner sits above the page, pushing it down, with no way to dismiss it", async ({ page }) => {
    await page.goto(`${stagingOrigin}/masuk`);
    await expect(banner(page)).toBeVisible();

    const bannerBox = (await banner(page).boundingBox())!;
    const mainBox = (await page.locator("main").first().boundingBox())!;
    expect(bannerBox.y).toBe(0);
    expect(mainBox.y).toBeGreaterThanOrEqual(bannerBox.y + bannerBox.height);
    await expect(banner(page).getByRole("button")).toHaveCount(0);
  });

  test("the staging banner is readable on a 360 px phone", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto(`${stagingOrigin}/`);
    await expect(banner(page)).toBeVisible();

    const bannerBox = (await banner(page).boundingBox())!;
    expect(bannerBox.x).toBe(0);
    expect(bannerBox.width).toBeLessThanOrEqual(360);
    const overflows = await banner(page).evaluate((element) => element.scrollWidth > element.clientWidth);
    expect(overflows).toBe(false);
    const pageScrollsSideways = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(pageScrollsSideways).toBe(false);
  });
});
