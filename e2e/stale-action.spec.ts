import { expect, test } from "@playwright/test";
import { coldEmail } from "./support/emails";
import { fromNewIp } from "./support/masuk";

test("a Server Action the site no longer knows shows the Indonesian 'Halaman diperbarui' page, not Next's English one", async ({ page }) => {
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"] !== undefined) {
      await route.fulfill({
        status: 404,
        headers: { "x-nextjs-action-not-found": "1", "content-type": "text/plain" },
        body: "Server action not found.",
      });
    } else {
      await route.continue();
    }
  });
  await page.goto("/masuk");
  await fromNewIp(page);
  await page.getByLabel("Email").fill(coldEmail());
  await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();

  await expect(page.getByRole("heading", { name: /Halaman diperbarui/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Muat ulang" })).toBeVisible();
  await expect(page.getByText("This page couldn’t load")).toHaveCount(0);
  await expect(page.getByText("This page couldn't load")).toHaveCount(0);
});
