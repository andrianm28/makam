import { expect, test, type Page } from "@playwright/test";
import { coldEmail } from "./support/emails";
import { fromNewIp } from "./support/masuk";

/**
 * A form left open across a deploy posts the Server Action id of the old build,
 * which the new build does not know: the server answers 404 with
 * `x-nextjs-action-not-found` and the client throws before the page hears of it
 * (ticket 98, found in the staging UAT). These specs make that answer, and a
 * plain 500, without a second build, by answering the Kode Masuk request of
 * /masuk themselves; every other request goes through to the stack.
 */
async function answerActionWith(page: Page, answer: { status: number; headers?: Record<string, string>; body: string }) {
  await page.route("**/masuk", async (route) => {
    const request = route.request();
    if (request.method() === "POST" && request.headers()["next-action"]) {
      await route.fulfill({
        status: answer.status,
        headers: { "content-type": "text/plain", ...answer.headers },
        body: answer.body,
      });
      return;
    }
    await route.continue();
  });
}

async function pressKirimKodeMasuk(page: Page) {
  await page.goto("/masuk");
  await page.getByLabel("Email").fill(coldEmail());
  await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
}

test("a form left open across a deploy says the page was updated in Indonesian, and Muat ulang brings a working form back", async ({
  page,
}) => {
  await answerActionWith(page, { status: 404, headers: { "x-nextjs-action-not-found": "1" }, body: "Server action not found." });
  await pressKirimKodeMasuk(page);

  await expect(page.getByRole("heading", { name: "Halaman ini sudah diperbarui" })).toBeVisible();
  await expect(page.getByText(/This page couldn.t load/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Muat ulang" })).toBeVisible();

  // The new build answers again: Muat ulang loads the page fresh, and Kirim works.
  await page.unroute("**/masuk");
  await fromNewIp(page);
  await page.getByRole("button", { name: "Muat ulang" }).click();
  await page.getByLabel("Email").fill(coldEmail());
  await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
  await expect(page.getByTestId("kode-masuk-email")).toBeVisible();
});

test("any other uncaught error shows a generic Indonesian page with Muat ulang and Beranda, and is reported to GlitchTip", async ({
  page,
}) => {
  // The browser is given a DSN on a host this spec answers itself, so what it reports can be read.
  const reported: string[] = [];
  await page.route("**/api/browser-config", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...(await response.json()), sentryDsn: "https://kuncipublik@glitchtip.contoh.test/7" } });
  });
  await page.route("https://glitchtip.contoh.test/**", async (route) => {
    reported.push(route.request().postData() ?? "");
    await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, contentType: "application/json", body: "{}" });
  });
  await answerActionWith(page, { status: 500, body: "uji galat umum" });
  await pressKirimKodeMasuk(page);

  await expect(page.getByRole("heading", { name: "Halaman ini tidak bisa dimuat" })).toBeVisible();
  await expect(page.getByText(/This page couldn.t load/)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Muat ulang" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Beranda" })).toBeVisible();
  await expect.poll(() => reported.some((envelope) => envelope.includes("uji galat umum"))).toBe(true);

  await page.getByRole("link", { name: "Beranda" }).click();
  await expect(page).toHaveURL(/\/$/);
});
