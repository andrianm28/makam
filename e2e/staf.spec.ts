import { expect, test, type Browser, type Page } from "@playwright/test";
import { e2eAdminPlatform, seedE2eAdminPlatform } from "./support/admin-platform";
import { emailsTo } from "./support/email-outbox";
import { coldEmail } from "./support/emails";
import { masuk } from "./support/masuk";
import { coldNumber } from "./support/numbers";
import { seedTagihan } from "./support/tagihan";

/*
 * Staff access on a fresh local stack (docker compose -p makam-v1-dev up --build -d):
 * the e2e Admin Platform (seeded by the seed CLI, see e2e/support/admin-platform.ts)
 * logs in with a Kode Masuk alone (ADR 0008: no TOTP), invites a Petugas Lapangan (Mitra Jasa is
 * not offered: it is taken out of the product with the TPU, ADR 0012), and the invitee logs in.
 * (Admin Lokasi are invited from their Lokasi Mitra's page; switching between two roles is
 * covered by the staff shell's tests.)
 */

test.describe.configure({ mode: "serial" });

const admin = e2eAdminPlatform;
const invitee = coldEmail("staf");
const inviteePhone = coldNumber();
let adminPage: Page;
/** The invitee's own browser, signed in as Petugas Lapangan. */
let inviteePage: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  seedE2eAdminPlatform();
  adminPage = await (await browser.newContext()).newPage();
});

test("the seeded Admin Platform logs in with a Kode Masuk alone and lands on its menu, no TOTP step", async ({ request }) => {
  const page = adminPage;
  await masuk(page, request, admin);

  await expect(page).toHaveURL(/\/staf\/admin-platform$/);
  await expect(page.getByRole("heading", { name: "Admin Platform" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu Admin Platform" })).toBeVisible();
  // One role only: no role switcher.
  await expect(page.getByRole("button", { name: /Ganti peran/ })).toHaveCount(0);
});

test("the staff shell: Admin Platform moves between menu items, collapses the sidebar and switches to dark", async () => {
  const page = adminPage;
  await page.goto("/staf/admin-platform");
  const menu = page.getByRole("navigation", { name: "Menu Admin Platform" });
  await expect(menu.getByRole("link", { name: "Beranda" })).toHaveAttribute("aria-current", "page");

  await menu.getByRole("link", { name: "Hari Libur Nasional" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform\/hari-libur$/);
  await expect(menu.getByRole("link", { name: "Hari Libur Nasional" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("navigation", { name: "Jejak halaman" })).toContainText("Hari Libur Nasional");
  await menu.getByRole("link", { name: "Lokasi Mitra" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform\/lokasi$/);
  await expect(page.getByRole("heading", { name: "Lokasi Mitra", level: 1 })).toBeVisible();

  // The sidebar collapses to icons, and stays so on the next page load.
  const sidebar = page.locator('[data-slot="sidebar"][data-state]');
  const toggle = page.locator('[data-slot="sidebar-trigger"]');
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await toggle.click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await toggle.click();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");

  // Dark mode in the staff area; the public pages stay light.
  await page.getByRole("button", { name: "Ganti tema" }).click();
  await page.getByRole("menuitemradio", { name: "Gelap" }).click();
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.goto("/akun");
  await expect(page.getByRole("heading", { name: "Akun Saya" })).toBeVisible();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
  await page.goto("/staf/admin-platform");
  await expect(page.locator("html")).toHaveClass(/\bdark\b/);
  await page.getByRole("button", { name: "Ganti tema" }).click();
  await page.getByRole("menuitemradio", { name: "Terang" }).click();
  await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
});

test("Admin Platform opens a Tagihan from the search list; the detail renders and an unknown id keeps the not-found page", async () => {
  const page = adminPage;
  const { nomorTagihan } = seedTagihan();

  await page.goto("/staf/admin-platform/tagihan");
  await page.getByLabel("Nomor Tagihan atau nomor pesanan").fill(nomorTagihan);
  await page.getByRole("button", { name: "Cari" }).click();
  const row = page.getByRole("listitem").filter({ hasText: nomorTagihan });
  await expect(row.getByRole("link", { name: "Buka" })).toBeVisible();
  await row.getByRole("link", { name: "Buka" }).click();

  await expect(page).toHaveURL(/\/staf\/admin-platform\/tagihan\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: `Tagihan ${nomorTagihan}` })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toHaveCount(0);

  await page.goto("/staf/admin-platform/tagihan/00000000-0000-0000-0000-000000000000");
  await expect(page.getByRole("heading", { name: "Halaman tidak ditemukan" })).toBeVisible();
});

test("the pin map asks for its tiles with the site's origin as Referer, though every page sends no-referrer", async () => {
  const page = adminPage;
  // OpenStreetMap answers a tile request without a Referer with a "403 Access blocked" image.
  const referers: (string | null)[] = [];
  const blankTile = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    "base64",
  );
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    referers.push(await route.request().headerValue("referer"));
    await route.fulfill({ contentType: "image/png", body: blankTile });
  });

  // nginx sends Referrer-Policy: no-referrer on every page in staging and production; the local stack does not.
  await page.route("**/staf/admin-platform/tugas-lapangan", async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), "referrer-policy": "no-referrer" } });
  });

  try {
    await page.goto("/staf/admin-platform/tugas-lapangan");
    const map = page.getByRole("region", { name: "Peta pin Lokasi" });
    await expect(map.locator("img.leaflet-tile").first()).toHaveAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    await expect.poll(() => referers.length).toBeGreaterThan(0);
    const origin = new URL(page.url()).origin;
    expect(referers.every((referer) => referer === `${origin}/`)).toBe(true);
  } finally {
    await page.unrouteAll();
  }
});

test("Admin Platform invites a Petugas Lapangan, and is not offered Mitra Jasa; the Undangan Staf goes out by email", async ({
  request,
}) => {
  const page = adminPage;
  await page.goto("/staf/admin-platform");
  await page.getByRole("navigation", { name: "Menu Admin Platform" }).getByRole("link", { name: "Staf" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform\/staf$/);

  await expect(page.getByLabel("Peran").locator("option")).toHaveText(["Admin Platform", "Petugas Lapangan"]);
  await page.getByLabel("Email").fill(invitee);
  await page.getByLabel("Nomor telepon").fill(inviteePhone.typed);
  await page.getByLabel("Peran").selectOption({ label: "Petugas Lapangan" });
  await page.getByRole("button", { name: "Kirim undangan" }).click();
  await expect(page.getByRole("status")).toContainText(`Undangan Petugas Lapangan terkirim ke ${invitee}`);

  const invites = (await emailsTo(request, invitee)).filter((message) => message.subject.startsWith("Undangan Staf"));
  expect(invites.map((message) => message.subject)).toEqual(["Undangan Staf Makam.co.id: Petugas Lapangan"]);
  await expect(page.getByTestId("undangan-terbuka")).toContainText(invitee);
});

test("the invitee logs in with a Kode Masuk and lands on its one role's menu", async ({ browser, request }) => {
  const page = await (await browser.newContext()).newPage();
  inviteePage = page;
  await masuk(page, request, invitee);

  // A field role has no Beranda: its bare home redirects to its first bottom
  // navigation item (Tugas), which is also its sidebar menu's first page.
  await expect(page).toHaveURL(/\/staf\/petugas-lapangan\/tugas$/);
  await expect(page.getByRole("heading", { name: "Tugas Lapangan" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu Petugas Lapangan" })).toBeVisible();
  // One role: nothing to switch to.
  await expect(page.getByRole("button", { name: /Ganti peran/ })).toHaveCount(0);

  // A role the Akun does not hold shows nothing of its menu.
  await page.goto("/staf/admin-platform");
  await expect(page).not.toHaveURL(/\/staf\/admin-platform/);
  await expect(page.getByRole("navigation", { name: "Menu Admin Platform" })).toHaveCount(0);
  await page.goto("/staf/admin-lokasi");
  await expect(page.getByRole("navigation", { name: "Menu Admin Lokasi" })).toHaveCount(0);
});

test("the staff area installs as an app: its manifest, icons and a service worker scoped to /staf", async ({ request }) => {
  const page = inviteePage;
  await page.goto("/staf/petugas-lapangan");

  // Installable: a manifest scoped to the staff area, with icons for Android and iPhone.
  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
  const manifest = await (await request.get(manifestHref!)).json();
  expect(manifest).toMatchObject({ start_url: "/staf", scope: "/staf", display: "standalone" });
  for (const icon of manifest.icons as { src: string }[]) {
    expect((await request.get(icon.src)).headers()["content-type"]).toBe("image/png");
  }
  const appleIcon = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(appleIcon!)).ok()).toBe(true);

  // The service worker registers for the staff area only.
  expect(await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)).toMatch(/\/staf$/);
});

test("Pemulihan Akun: Admin Platform moves a Pemesan's Akun to a new Email Terverifikasi after a KTP check", async ({
  browser,
  request,
}) => {
  const oldEmail = coldEmail("lama");
  const newEmail = coldEmail("baru");
  const pemesan = await (await browser.newContext()).newPage();
  await masuk(pemesan, request, oldEmail);
  await expect(pemesan).toHaveURL(/\/akun$/);

  const page = adminPage;
  await page.goto("/staf/admin-platform");
  await page.getByRole("navigation", { name: "Menu Admin Platform" }).getByRole("link", { name: "Pemulihan Akun" }).click();
  await page.getByLabel("Email Akun sekarang").fill(oldEmail);
  await page.getByLabel("Email baru").fill(newEmail);
  await page.getByLabel("Foto atau scan KTP").setInputFiles({
    name: "ktp.jpg",
    mimeType: "image/jpeg",
    // A JPEG's first bytes: the identity module checks them against the declared type.
    buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("foto KTP")]),
  });
  await page.getByLabel("KTP sudah dicek: cocok dengan data Akun").check();
  await page.getByLabel("Alasan").fill("Email lama tidak bisa dibuka; KTP cocok dengan data Akun");
  await page.getByRole("button", { name: "Pulihkan Akun" }).click();
  await expect(page.getByRole("status")).toContainText(`Email Terverifikasi-nya sekarang ${newEmail}`);

  // The old session ended; the same Akun now logs in with the new email.
  await pemesan.goto("/akun");
  await expect(pemesan).toHaveURL(/\/masuk/);
  await masuk(pemesan, request, newEmail);
  await expect(pemesan.getByTestId("akun-login-email")).toHaveText(newEmail);
});

test("Admin Platform deactivates the invitee: the staff session on its device no longer grants staff access", async () => {
  // Logging in again as a Pemesan, and a new Undangan Staf making it staff again, are covered by the identity
  // module's tests (staff-access.test.ts): a second Kode Masuk to one email here would wait 60 s.
  const staffPage = inviteePage;
  await staffPage.goto("/staf/petugas-lapangan");
  await expect(staffPage.getByRole("navigation", { name: "Menu Petugas Lapangan" })).toBeVisible();

  const page = adminPage;
  await page.goto("/staf/admin-platform/staf");
  const row = page.getByRole("row", { name: new RegExp(invitee.replace(/[.+]/g, "\\$&")) });
  await row.getByLabel("Alasan").fill("Uji e2e");
  await row.getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row).toContainText("Dinonaktifkan");

  await staffPage.goto("/staf/petugas-lapangan");
  await expect(staffPage).toHaveURL(/\/masuk/);
});
