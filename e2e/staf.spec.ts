import { expect, test, type Browser, type Page } from "@playwright/test";
import { authenticatorCode } from "../tests/support/totp";
import { e2eAdminPlatform, seedE2eAdminPlatform } from "./support/admin-platform";
import { masuk, startTotpEnrolment, submitTotp } from "./support/masuk";
import { coldNumber } from "./support/numbers";
import { outbox } from "./support/whatsapp-outbox";

/*
 * Staff access on a fresh local stack (docker compose -p makam-v1-dev up --build -d):
 * the e2e Admin Platform (seeded by the seed CLI, see e2e/support/admin-platform.ts)
 * logs in by OTP, enrols and passes TOTP, invites an Admin Lokasi (who is also a
 * Petugas Lapangan), and the invitee logs in and switches roles. The first test
 * enrols TOTP, so this file needs a stack whose e2e Admin Platform has not
 * enrolled yet (a fresh one, or `down -v` between runs).
 */

test.describe.configure({ mode: "serial" });

const admin = e2eAdminPlatform;
const invitee = coldNumber();
let adminPage: Page;
/** The invitee's own browser, signed in as Admin Lokasi and Petugas Lapangan. */
let inviteePage: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  seedE2eAdminPlatform();
  adminPage = await (await browser.newContext()).newPage();
});

test("the seeded Admin Platform logs in by OTP, must enrol TOTP, and passes it with the authenticator code", async ({
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
  await expect(page.getByRole("navigation", { name: "Ganti peran" })).toHaveCount(0);
});

test("Admin Platform invites an Admin Lokasi who is also a Petugas Lapangan; the invite goes out by WhatsApp", async ({
  request,
}) => {
  const page = adminPage;
  await page.goto("/staf/admin-platform");
  await page.getByRole("navigation", { name: "Menu Admin Platform" }).getByRole("link", { name: "Staf" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform\/staf$/);

  for (const role of ["Admin Lokasi", "Petugas Lapangan"]) {
    await page.getByLabel("Nomor WhatsApp").fill(invitee.typed);
    await page.getByLabel("Email").fill("lokasi-e2e@contoh.id");
    await page.getByLabel("Peran").selectOption({ label: role });
    await page.getByRole("button", { name: "Kirim undangan" }).click();
    await expect(page.getByRole("status")).toContainText(`Undangan ${role} terkirim ke ${invitee.canonical}`);
  }

  const invites = (await outbox(request, invitee.canonical)).filter((message) => message.template === "staf_undangan");
  expect(invites.map((message) => message.parameters[0])).toEqual(["Admin Lokasi", "Petugas Lapangan"]);
  await expect(page.getByTestId("undangan-terbuka")).toContainText(invitee.canonical);
});

test("the invitee logs in by OTP, holds both roles, and switches between their menus", async ({ browser, request }) => {
  const page = await (await browser.newContext()).newPage();
  inviteePage = page;
  await masuk(page, request, invitee);

  await expect(page).toHaveURL(/\/staf\/admin-lokasi$/);
  await expect(page.getByRole("heading", { name: "Admin Lokasi" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu Admin Lokasi" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu Petugas Lapangan" })).toHaveCount(0);

  const switcher = page.getByRole("navigation", { name: "Ganti peran" });
  await expect(switcher.getByRole("link")).toHaveText(["Admin Lokasi", "Petugas Lapangan"]);
  await switcher.getByRole("link", { name: "Petugas Lapangan" }).click();
  await expect(page).toHaveURL(/\/staf\/petugas-lapangan$/);
  await expect(page.getByRole("navigation", { name: "Menu Petugas Lapangan" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Menu Admin Lokasi" })).toHaveCount(0);

  // A role the Akun does not hold shows nothing of its menu.
  await page.goto("/staf/admin-platform");
  await expect(page).not.toHaveURL(/\/staf\/admin-platform/);
  await expect(page.getByRole("navigation", { name: "Menu Admin Platform" })).toHaveCount(0);
  await page.goto("/staf/mitra-jasa");
  await expect(page.getByRole("navigation", { name: "Menu Mitra Jasa" })).toHaveCount(0);
});

test("the staff area installs as an app: its manifest, icons and a service worker scoped to /staf", async ({ request }) => {
  const page = inviteePage;
  await page.goto("/staf/admin-lokasi");

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

test("Admin Platform moves a Pemesan's Akun to a new number after a KTP check", async ({ browser, request }) => {
  const oldNumber = coldNumber();
  const newNumber = coldNumber();
  const pemesan = await (await browser.newContext()).newPage();
  await masuk(pemesan, request, oldNumber);
  await expect(pemesan).toHaveURL(/\/akun$/);

  const page = adminPage;
  await page.goto("/staf/admin-platform");
  await page.getByRole("navigation", { name: "Menu Admin Platform" }).getByRole("link", { name: "Pindah Nomor" }).click();
  await page.getByLabel("Nomor lama").fill(oldNumber.typed);
  await page.getByLabel("Nomor baru").fill(newNumber.typed);
  await page.getByLabel("Foto atau scan KTP").setInputFiles({
    name: "ktp.jpg",
    mimeType: "image/jpeg",
    // A JPEG's first bytes: the identity module checks them against the declared type.
    buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("foto KTP")]),
  });
  await page.getByLabel("Saya sudah mencocokkan KTP dengan data Akun").check();
  await page.getByLabel("Alasan").fill("HP hilang; KTP cocok dengan data pesanan");
  await page.getByRole("button", { name: "Pindahkan nomor" }).click();
  await expect(page.getByRole("status")).toContainText(`Akun dipindah ke ${newNumber.canonical}`);

  // The old session ended; the same Akun now logs in with the new number.
  await pemesan.goto("/akun");
  await expect(pemesan).toHaveURL(/\/masuk/);
  await masuk(pemesan, request, newNumber);
  await expect(pemesan.getByTestId("akun-phone-number")).toHaveText(newNumber.canonical);
});

test("Admin Platform deactivates the invitee: staff access ends, but the number still logs in as a Pemesan", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const staffPage = inviteePage;
  await staffPage.goto("/staf/admin-lokasi");
  await expect(staffPage.getByRole("navigation", { name: "Menu Admin Lokasi" })).toBeVisible();

  const page = adminPage;
  await page.goto("/staf/admin-platform/staf");
  const row = page.getByRole("row", { name: new RegExp(invitee.canonical.replace("+", "\\+")) });
  await row.getByLabel("Alasan").fill("Uji e2e");
  await row.getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(row).toContainText("Dinonaktifkan");

  // The staff session on the other device no longer grants staff access.
  await staffPage.goto("/staf/admin-lokasi");
  await expect(staffPage).toHaveURL(/\/masuk/);

  // The number logs in again as a Pemesan: Akun Saya opens, the staff area does not.
  const pemesan = await (await browser.newContext()).newPage();
  await masuk(pemesan, request, invitee);
  await expect(pemesan).toHaveURL(/\/akun$/);
  await expect(pemesan.getByTestId("akun-phone-number")).toHaveText(invitee.canonical);
  await pemesan.goto("/staf");
  await expect(pemesan).toHaveURL(/\/akun$/);
  await pemesan.goto("/staf/admin-lokasi");
  await expect(pemesan).not.toHaveURL(/\/staf\/admin-lokasi/);
  await expect(pemesan.getByRole("navigation", { name: "Menu Admin Lokasi" })).toHaveCount(0);
});

test("Admin Platform invites the Dinonaktifkan number again: its next login holds the role again", async ({
  browser,
  request,
}) => {
  test.setTimeout(120_000);
  const page = adminPage;
  await page.goto("/staf/admin-platform/staf");
  await page.getByLabel("Nomor WhatsApp").fill(invitee.typed);
  await page.getByLabel("Email").fill("kembali-e2e@contoh.id");
  await page.getByLabel("Peran").selectOption({ label: "Mitra Jasa" });
  await page.getByRole("button", { name: "Kirim undangan" }).click();
  await expect(page.getByRole("status")).toContainText(`Undangan Mitra Jasa terkirim ke ${invitee.canonical}`);

  const staffPage = await (await browser.newContext()).newPage();
  await masuk(staffPage, request, invitee);
  await expect(staffPage).toHaveURL(/\/staf\/mitra-jasa$/);
  await expect(staffPage.getByRole("navigation", { name: "Menu Mitra Jasa" })).toBeVisible();

  await page.reload();
  const row = page.getByRole("row", { name: new RegExp(invitee.canonical.replace("+", "\\+")) });
  await expect(row).toContainText("Mitra Jasa");
  await expect(row).not.toContainText("Dinonaktifkan");
});
