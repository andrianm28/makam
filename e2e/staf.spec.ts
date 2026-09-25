import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { authenticatorCode } from "../tests/support/totp";

/*
 * Staff access on a fresh local stack (docker compose -p makam-v1-dev up --build -d):
 * the seed CLI makes the first Admin Platform, who logs in by OTP, enrols and
 * passes TOTP, invites an Admin Lokasi (who is also a Petugas Lapangan), and the
 * invitee logs in and switches roles. The seed is refused once an Admin
 * Platform exists, so this file needs a fresh database (`down -v` between runs).
 *
 * The seed runs inside the web container; override with E2E_SEED_ADMIN, e.g.
 * E2E_SEED_ADMIN="npx tsx src/cli/seed-admin.ts" against a local dev server.
 */
const SEED_ADMIN = (process.env.E2E_SEED_ADMIN ?? "docker compose -p makam-v1-dev exec -T web node dist/seed-admin.mjs").split(" ");

test.describe.configure({ mode: "serial" });

function coldNumber() {
  const subscriber = `8${Math.floor(Math.random() * 1e10).toString().padStart(10, "0")}`;
  return { typed: `0${subscriber}`, canonical: `+62${subscriber}` };
}

async function outbox(request: APIRequestContext, to: string) {
  const response = await request.get(`/api/dev/whatsapp-outbox?to=${encodeURIComponent(to)}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { messages: { template: string; copyCode?: string; parameters: string[] }[] })
    .messages;
}

async function lastOtp(request: APIRequestContext, to: string): Promise<string> {
  let code: string | undefined;
  await expect(async () => {
    code = (await outbox(request, to)).filter((message) => message.template === "kode_verifikasi").at(-1)?.copyCode;
    expect(code).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}

async function masuk(page: Page, request: APIRequestContext, number: { typed: string; canonical: string }) {
  await page.goto("/masuk");
  await page.getByLabel("Nomor WhatsApp").fill(number.typed);
  // The stack runs on the system Clock: a number that just had an OTP waits up to 60 s for the next one.
  await expect(async () => {
    await page.getByRole("button", { name: "Kirim kode lewat WhatsApp" }).click();
    await expect(page.getByTestId("otp-phone-number")).toHaveText(number.canonical, { timeout: 3_000 });
  }).toPass({ timeout: 75_000, intervals: [5_000] });
  await page.getByLabel("Kode verifikasi").fill(await lastOtp(request, number.canonical));
  await page.getByRole("button", { name: "Masuk" }).click();
}

const admin = coldNumber();
const invitee = coldNumber();
let adminPage: Page;
/** The invitee's own browser, signed in as Admin Lokasi and Petugas Lapangan. */
let inviteePage: Page;

test.beforeAll(async ({ browser }: { browser: Browser }) => {
  const [command, ...args] = SEED_ADMIN;
  const output = execFileSync(command, [...args, admin.typed, "admin-e2e@makam.co.id"], { encoding: "utf8" });
  expect(output).toContain(`Admin Platform pertama dibuat: ${admin.canonical}`);
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

  await page.getByRole("button", { name: "Daftarkan aplikasi authenticator" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.replace(/\s/g, "");
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  await page.getByLabel("Kode authenticator").fill("000000" === authenticatorCode(secret, new Date()) ? "111111" : "000000");
  await page.getByRole("button", { name: "Verifikasi" }).click();
  await expect(page.getByText("Kode authenticator salah")).toBeVisible();

  await page.getByLabel("Kode authenticator").fill(authenticatorCode(secret, new Date()));
  await page.getByRole("button", { name: "Verifikasi" }).click();

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
