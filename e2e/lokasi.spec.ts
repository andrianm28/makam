import { expect, test, type Page } from "@playwright/test";
import { ADMIN_PLATFORM_STATE, coldNumber, masuk, outbox } from "./support/masuk";

/*
 * Ticket 10 smoke test: Lokasi Mitra onboarding and Admin Lokasi invites.
 * Runs after staf.spec (project "staf-lanjutan"), signed in as the Admin
 * Platform it seeded. What the Lokasi module decides (defaults, who may change
 * the bank account, scoping, the audit filter) is covered by its domain tests;
 * this only walks the screens once.
 */
test.describe.configure({ mode: "serial" });
test.use({ storageState: ADMIN_PLATFORM_STATE });

const suffix = Math.floor(Math.random() * 1e6).toString();
const first = `Makam Wakaf Al-Ikhlas ${suffix}`;
const second = `Makam Keluarga Sentosa ${suffix}`;
const adminLokasi = coldNumber();
const ids: Record<string, string> = {};

async function createLokasiMitra(page: Page, name: string) {
  await page.goto("/staf/admin-platform");
  await page.getByRole("navigation", { name: "Menu Admin Platform" }).getByRole("link", { name: "Lokasi Mitra" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform\/lokasi$/);
  await page.getByLabel("Nama Lokasi Mitra").fill(name);
  await page.getByLabel("Nama pengelola").fill("Yayasan Uji");
  await page.getByLabel("Alamat").fill("Jl. Raya Pondok Rangon No. 1");
  await page.getByLabel("Kota / kabupaten").fill("Kota Jakarta Timur");
  await page.getByRole("button", { name: "Buat Lokasi Mitra" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform\/lokasi\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
  return page.url().split("/").at(-1)!;
}

test("Admin Platform onboards a Lokasi Mitra: Belum Tayang, pin on the map, agreement scan by signed URL, bank account", async ({
  page,
}) => {
  ids[first] = await createLokasiMitra(page, first);
  await expect(page.getByTestId("status-lokasi")).toHaveText("Belum Tayang");

  const profil = page.getByRole("region", { name: "Profil" });
  await expect(profil.locator(".leaflet-container")).toBeVisible();
  await profil.getByLabel("Lintang").fill("-6.3421");
  await profil.getByLabel("Bujur").fill("106.9027");
  await profil.getByLabel("Parkir").check();
  await profil.getByRole("button", { name: "Simpan profil" }).click();
  await expect(profil.getByRole("status")).toHaveText("Profil tersimpan.");

  const perjanjian = page.getByRole("region", { name: "Perjanjian" });
  await perjanjian.getByLabel("Scan perjanjian").setInputFiles({
    name: "perjanjian.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nperjanjian kerja sama\n%%EOF\n"),
  });
  await perjanjian.getByLabel("Tanggal perjanjian").fill("2026-09-20");
  await perjanjian.getByRole("button", { name: "Unggah perjanjian" }).click();
  await expect(perjanjian.getByRole("status")).toHaveText("Scan perjanjian tersimpan.");
  const href = await perjanjian.getByRole("link", { name: "Lihat scan perjanjian" }).getAttribute("href");
  const viewed = await page.request.get(href!, { maxRedirects: 0 });
  expect(viewed.status()).toBe(303);
  // The in-memory FileStore signs with its own host; the live S3 adapter signs a real URL the same way.
  expect(viewed.headers().location).toMatch(/^https:\/\/files\.fake\.local\/perjanjian\/.+\.pdf\?expires=\d+$/);

  const rekening = page.getByRole("region", { name: "Rekening" });
  await rekening.getByLabel("Bank").fill("BSI");
  await rekening.getByLabel("Nomor rekening").fill("7123456789");
  await rekening.getByLabel("Atas nama").fill("Yayasan Uji");
  await rekening.getByRole("button", { name: "Simpan rekening" }).click();
  await expect(rekening.getByRole("status")).toHaveText("Rekening tersimpan.");
});

test("Admin Platform invites an Admin Lokasi to two Lokasi Mitra; it switches between them and reads each one's Audit Log", async ({
  page,
  browser,
  request,
}) => {
  ids[second] = await createLokasiMitra(page, second);
  for (const name of [first, second]) {
    await page.goto(`/staf/admin-platform/lokasi/${ids[name]}`);
    const section = page.getByRole("region", { name: "Admin Lokasi" });
    await section.getByLabel("Nomor WhatsApp").fill(adminLokasi.typed);
    await section.getByLabel("Email").fill("pengelola-e2e@contoh.id");
    await section.getByRole("button", { name: "Undang Admin Lokasi" }).click();
    await expect(section.getByRole("status")).toContainText(`Undangan Admin Lokasi terkirim ke ${adminLokasi.canonical}`);
  }
  expect((await outbox(request, adminLokasi.canonical)).filter((message) => message.template === "staf_undangan")).toHaveLength(2);

  const staff = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
  await masuk(staff, request, adminLokasi);
  await expect(staff).toHaveURL(new RegExp(`/staf/admin-lokasi/(${ids[first]}|${ids[second]})$`));
  const switcher = staff.getByRole("navigation", { name: "Ganti Lokasi" });
  // By name: Keluarga Sentosa before Wakaf Al-Ikhlas.
  await expect(switcher.getByRole("link")).toHaveText([second, first]);

  await switcher.getByRole("link", { name: first }).click();
  await expect(staff).toHaveURL(new RegExp(`/staf/admin-lokasi/${ids[first]}$`));
  await expect(staff.getByRole("heading", { level: 1, name: first })).toBeVisible();
  await staff.getByRole("navigation", { name: "Menu Admin Lokasi" }).getByRole("link", { name: "Audit Log" }).click();
  await expect(staff).toHaveURL(new RegExp(`/staf/admin-lokasi/${ids[first]}/audit-log$`));
  const log = staff.getByRole("table", { name: "Audit Log Lokasi" });
  await expect(log).toContainText("Rekening diubah");
  await expect(log).toContainText("7123456789");

  await switcher.getByRole("link", { name: second }).click();
  await expect(staff).toHaveURL(new RegExp(`/staf/admin-lokasi/${ids[second]}$`));
  await staff.goto(`/staf/admin-lokasi/${ids[second]}/audit-log`);
  await expect(staff.getByRole("table", { name: "Audit Log Lokasi" })).not.toContainText("Rekening diubah");

  // The Admin Platform screens stay closed to the Admin Lokasi.
  await staff.goto(`/staf/admin-platform/lokasi/${ids[first]}`);
  await expect(staff).not.toHaveURL(/\/staf\/admin-platform/);
});
