import { expect, test, type Browser, type Page } from "@playwright/test";
import { authenticatorCode } from "../tests/support/totp";
import { e2eAdminPlatform, seedE2eAdminPlatform } from "./support/admin-platform";
import { emailsTo } from "./support/email-outbox";
import { coldEmail } from "./support/emails";
import { masuk, startTotpEnrolment, submitTotp } from "./support/masuk";
import { coldNumber } from "./support/numbers";

/*
 * Staff access on a fresh local stack (docker compose -p makam-v1-dev up --build -d):
 * the e2e Admin Platform (seeded by the seed CLI, see e2e/support/admin-platform.ts)
 * logs in with a Kode Masuk, enrols and passes TOTP, invites a Petugas Lapangan (who is also a
 * Mitra Jasa), and the invitee logs in and switches roles. (Admin Lokasi are
 * invited from their Lokasi Mitra's page.) The first test
 * enrols TOTP, so this file needs a stack whose e2e Admin Platform has not
 * enrolled yet (a fresh one, or `down -v` between runs).
 */

test.describe.configure({ mode: "serial" });

const admin = e2eAdminPlatform;
const invitee = coldEmail("staf");
const inviteePhone = coldNumber();
let adminPage: Page;
/** The invitee's own browser, signed in as Petugas Lapangan and Mitra Jasa. */
let inviteePage: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  seedE2eAdminPlatform();
  adminPage = await (await browser.newContext()).newPage();
});

test("the seeded Admin Platform logs in with a Kode Masuk, must enrol TOTP, and passes it with the authenticator code", async ({
  request,
}) => {
  const page = adminPage;
  await masuk(page, request, admin);

  // Staff land in the staff area; an Admin Platform without TOTP is held at the TOTP step.
  await expect(page).toHaveURL(/\/staf\/totp$/);
  await page.goto("/akun");
  await expect(page).toHaveURL(/\/staf\/totp$/);
  await page.goto("/staf/admin-platform");
  await expect(page).toHaveURL(/\/staf\/totp$/);

  const secret = await startTotpEnrolment(page);
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel("Kode authenticator").fill("000000" === authenticatorCode(secret, new Date()) ? "111111" : "000000");
  await page.getByRole("button", { name: "Verifikasi" }).click();
  await expect(page.getByText("Kode authenticator salah")).toBeVisible();

  await submitTotp(page, secret);

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

test("Admin Platform invites a Petugas Lapangan who is also a Mitra Jasa; the Undangan Staf goes out by email", async ({
  request,
}) => {
  const page = adminPage;
  await page.goto("/staf/admin-platform");
  await page.getByRole("navigation", { name: "Menu Admin Platform" }).getByRole("link", { name: "Staf" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform\/staf$/);

  for (const role of ["Petugas Lapangan", "Mitra Jasa"]) {
    await page.getByLabel("Email").fill(invitee);
    await page.getByLabel("Nomor telepon").fill(inviteePhone.typed);
    await page.getByLabel("Peran").selectOption({ label: role });
    await page.getByRole("button", { name: "Kirim undangan" }).click();
    await expect(page.getByRole("status")).toContainText(`Undangan ${role} terkirim ke ${invitee}`);
  }

  const invites = (await emailsTo(request, invitee)).filter((message) => message.subject.startsWith("Undangan Staf"));
  expect(invites.map((message) => message.subject)).toEqual([
    "Undangan Staf Makam.co.id: Petugas Lapangan",
    "Undangan Staf Makam.co.id: Mitra Jasa",
  ]);
  await expect(page.getByTestId("undangan-terbuka")).toContainText(invitee);
});

test("the invitee logs in with a Kode Masuk, holds both roles, and switches between their menus", async ({ browser, request }) => {
  const page = await (await browser.newContext()).newPage();
  inviteePage = page;
  await masuk(page, request, invitee);

  await expect(page).toHaveURL(/\/staf\/petugas-lapangan$/);
  await expect(page.getByRole("heading", { name: "Petugas Lapangan" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu Petugas Lapangan" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu Mitra Jasa" })).toHaveCount(0);

  await page.getByRole("button", { name: /Ganti peran/ }).click();
  await expect(page.getByRole("menuitem")).toHaveText(["Petugas Lapangan", "Mitra Jasa"]);
  await page.getByRole("menuitem", { name: "Mitra Jasa" }).click();
  await expect(page).toHaveURL(/\/staf\/mitra-jasa$/);
  await expect(page.getByRole("navigation", { name: "Menu Mitra Jasa" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu Petugas Lapangan" })).toHaveCount(0);

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
