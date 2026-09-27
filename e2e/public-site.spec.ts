import { expect, test } from "@playwright/test";

/**
 * The public site's own smoke test: the Beranda's hero in the order a family in a
 * hurry reads it, and the menu — in the top bar on a wide screen, in the drawer
 * on a phone. Both list the same items, and nothing here promises a release date
 * (docs/design-system.md, voice and tone).
 *
 * No login, no seeded data: this runs on a fresh stack, which is why it does not
 * assert on the CS link — that link is the number from Pengaturan Operator, and a
 * stack nobody has filled in has none. `cs-link.test.ts` and `site-header.test.ts`
 * cover it instead.
 */
const menuLabels = ["Pesan Makam", "Makam Keluarga", "Layanan", "Wakaf Tanah", "Daftar Lokasi"];

/** The three services that arrive in a later release. */
const belumHadir = ["Makam Keluarga", "Layanan", "Wakaf Tanah"];

test("the Beranda leads with the urgent entry, and offers the planned one beside it", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Urus Pemakaman dengan Tenang, dalam Satu Platform.",
  );
  await expect(page.getByText("Menemani Keluarga, Menjaga Kenangan.")).toBeVisible();

  // The urgent entry is the one button, captioned for a family that just lost
  // someone; the planned entry is a quieter link of its own, not a second button.
  const urgent = page.getByRole("link", { name: "Pesan makam sekarang" });
  await expect(urgent).toBeVisible();
  await expect(urgent).toHaveAttribute("href", "/pesan-makam/saat-duka");
  await expect(page.getByText("untuk keluarga yang baru saja kehilangan")).toBeVisible();
  await expect(page.getByRole("link", { name: "Siapkan makam untuk nanti" })).toHaveAttribute(
    "href",
    "/pesan-makam/terencana",
  );

  // The tile row, then the trust strip below it.
  await expect(page.getByRole("heading", { name: "Perpanjang Makam" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wakaf Tanah" })).toBeVisible();
  await expect(page.getByRole("link", { name: /^Aman/ })).toHaveAttribute("href", "/cara-kami-bekerja");
});

test("the top bar lists the whole menu, and only opens the pages that exist", async ({ page }) => {
  await page.goto("/");

  const menu = page.getByRole("navigation", { name: "Menu utama" });
  for (const label of [...menuLabels, "Masuk"]) {
    await expect(menu.getByText(label, { exact: true })).toBeVisible();
  }
  for (const label of belumHadir) {
    // Listed, and said to be coming — but not a link to a page that is not there.
    await expect(menu.getByText(label, { exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: new RegExp(`^${label}`) })).toHaveCount(0);
  }
  await expect(menu.getByText("Segera", { exact: true })).toHaveCount(belumHadir.length);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the drawer lists the same menu as the top bar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Buka menu" }).click();

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    for (const label of [...menuLabels, "Masuk"]) {
      await expect(drawer.getByText(label, { exact: true })).toBeVisible();
    }
    // An item whose page is not here says so in full, and names no date.
    await expect(drawer.getByText("Segera hadir.")).toHaveCount(belumHadir.length);
    await expect(drawer).not.toContainText("2026");
  });
});
