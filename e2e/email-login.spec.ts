import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

/*
 * Ticket 67 smoke: Verifikasi Email in Akun Saya with the fake email outbox,
 * then Keluar, then Masuk dengan email. The rules themselves are covered by
 * the identity module's tests (email-login.test.ts).
 *
 * The stack has no nginx, so each step sends its own X-Real-IP (as nginx
 * would set it) to stay clear of the per-IP 60 s limit on emailed codes.
 */

function coldNumber() {
  const subscriber = `8${Math.floor(Math.random() * 1e10).toString().padStart(10, "0")}`;
  return { typed: `0${subscriber}`, canonical: `+62${subscriber}` };
}

function randomIp(): string {
  return `10.${[0, 0, 0].map(() => Math.floor(Math.random() * 254) + 1).join(".")}`;
}

async function lastWhatsAppCode(request: APIRequestContext, to: string): Promise<string> {
  let code: string | undefined;
  await expect(async () => {
    const response = await request.get(`/api/dev/whatsapp-outbox?to=${encodeURIComponent(to)}`);
    const { messages } = (await response.json()) as { messages: { template: string; copyCode?: string }[] };
    code = messages.filter((message) => message.template === "kode_verifikasi").at(-1)?.copyCode;
    expect(code).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}

/** The code in the newest email the fake EmailSender "sent" to `to` whose subject contains `subject`. */
async function lastEmailCode(request: APIRequestContext, to: string, subject: string, after = 0): Promise<string> {
  let code: string | undefined;
  await expect(async () => {
    const response = await request.get(`/api/dev/email-outbox?to=${encodeURIComponent(to)}`);
    expect(response.ok()).toBe(true);
    const { messages } = (await response.json()) as { messages: { subject: string; code?: string }[] };
    const matching = messages.filter((message) => message.subject.includes(subject));
    expect(matching.length).toBeGreaterThan(after);
    code = matching.at(-1)?.code;
    expect(code).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}

async function fromNewIp(page: Page) {
  await page.setExtraHTTPHeaders({ "x-real-ip": randomIp() });
}

test("Verifikasi Email in Akun Saya, Keluar, then Masuk dengan email lands back on Akun Saya", async ({ page, request }) => {
  const number = coldNumber();
  const email = `pemesan-${number.canonical.slice(3)}@contoh.id`;

  await page.goto("/masuk");
  await page.getByLabel("Nomor WhatsApp").fill(number.typed);
  await page.getByRole("button", { name: "Kirim kode lewat WhatsApp" }).click();
  await page.getByLabel("Kode verifikasi").fill(await lastWhatsAppCode(request, number.canonical));
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/akun$/);

  await fromNewIp(page);
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Kirim kode verifikasi" }).click();
  await page.getByLabel("Kode dari email").fill(await lastEmailCode(request, email, "verifikasi"));
  await page.getByRole("button", { name: "Verifikasi email" }).click();
  await expect(page.getByTestId("akun-email-status")).toHaveText("Terverifikasi");

  await page.getByRole("button", { name: "Keluar" }).click();
  await expect(page).toHaveURL(/\/masuk$/);

  await fromNewIp(page);
  await page.getByRole("link", { name: "Masuk dengan email" }).click();
  await page.getByLabel("Email").fill(email.toUpperCase());
  await page.getByRole("button", { name: "Kirim kode lewat email" }).click();
  await expect(page.getByText("Jika email ini terdaftar dan terverifikasi, kode sudah kami kirim.")).toBeVisible();
  await page.getByLabel("Kode dari email").fill(await lastEmailCode(request, email, "Kode Masuk"));
  await page.getByRole("button", { name: "Masuk" }).click();

  await expect(page).toHaveURL(/\/akun$/);
  await expect(page.getByTestId("akun-phone-number")).toHaveText(number.canonical);
});

test("the email outbox is a development-only route: it needs an address", async ({ request }) => {
  const response = await request.get("/api/dev/email-outbox");
  expect(response.status()).toBe(400);
});
