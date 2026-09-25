import { execFileSync } from "node:child_process";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { authenticatorCode } from "../tests/support/totp";

/*
 * Smoke test of the Pengaturan Operator screen (ticket 63) on a fresh local
 * stack. The rules (who may change it, audit, validation, values in force at
 * an instant) are covered by the domain tests; this only checks the screen.
 *
 * Like staf.spec.ts this seeds the first Admin Platform, which is refused once
 * one exists: run it on its own fresh stack (`down -v` between runs), e.g.
 *   MAKAM_WEB_PORT=3324 docker compose -p makam-t63 up --build -d
 *   E2E_SEED_ADMIN="docker compose -p makam-t63 exec -T web node dist/seed-admin.mjs" \
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3324 npx playwright test e2e/pengaturan-operator.spec.ts
 */
const SEED_ADMIN = (process.env.E2E_SEED_ADMIN ?? "docker compose -p makam-v1-dev exec -T web node dist/seed-admin.mjs").split(" ");

function coldNumber() {
  const subscriber = `8${Math.floor(Math.random() * 1e10).toString().padStart(10, "0")}`;
  return { typed: `0${subscriber}`, canonical: `+62${subscriber}` };
}

async function lastOtp(request: APIRequestContext, to: string): Promise<string> {
  let code: string | undefined;
  await expect(async () => {
    const response = await request.get(`/api/dev/whatsapp-outbox?to=${encodeURIComponent(to)}`);
    expect(response.ok()).toBe(true);
    const { messages } = (await response.json()) as { messages: { template: string; copyCode?: string }[] };
    code = messages.filter((message) => message.template === "kode_verifikasi").at(-1)?.copyCode;
    expect(code).toMatch(/^\d{6}$/);
  }).toPass({ timeout: 10_000 });
  return code!;
}

/** Seeds the first Admin Platform, logs it in by OTP and passes TOTP. */
async function signInAsFirstAdminPlatform(page: Page, request: APIRequestContext) {
  const admin = coldNumber();
  const [command, ...args] = SEED_ADMIN;
  execFileSync(command, [...args, admin.typed, "admin-t63@makam.co.id"], { encoding: "utf8" });

  await page.goto("/masuk");
  await page.getByLabel("Nomor WhatsApp").fill(admin.typed);
  await page.getByRole("button", { name: "Kirim kode lewat WhatsApp" }).click();
  await page.getByLabel("Kode verifikasi").fill(await lastOtp(request, admin.canonical));
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(page).toHaveURL(/\/staf\/totp$/);
  await page.getByRole("button", { name: "Daftarkan aplikasi authenticator" }).click();
  const secret = (await page.getByTestId("totp-secret").textContent())!.replace(/\s/g, "");
  await page.getByLabel("Kode authenticator").fill(authenticatorCode(secret, new Date()));
  await page.getByRole("button", { name: "Verifikasi" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform$/);
}

test("Admin Platform enters Pengaturan Operator before launch; the saved values show on the screen", async ({
  page,
  request,
}) => {
  await signInAsFirstAdminPlatform(page, request);

  await page.getByRole("navigation", { name: "Menu Admin Platform" }).getByRole("link", { name: "Pengaturan Operator" }).click();
  await expect(page).toHaveURL(/\/staf\/admin-platform\/pengaturan-operator$/);
  // Nothing is seeded.
  await expect(page.getByTestId("pengaturan-berlaku")).toContainText("Belum diisi");

  await page.getByLabel("Nama resmi Operator").fill("PT Jaya Korpora Prima");
  await page.getByLabel("Alamat terdaftar").fill("Jl. Contoh No. 1, Jakarta Selatan 12345");
  await page.getByLabel("Telepon Operator").fill("(021) 555-0101");
  await page.getByLabel("Email Operator").fill("halo@makam.co.id");
  await page.getByLabel("Nomor WhatsApp CS").fill("0811");
  await page.getByLabel("Jam balas CS").fill("dibalas mulai pukul 06:00");
  await page.getByRole("button", { name: "Simpan" }).click();
  // The refusal keeps what was typed; only the CS number needs fixing.
  await expect(page.getByTestId("pengaturan-operator-form").getByRole("alert")).toContainText("Nomor WhatsApp CS");
  await expect(page.getByLabel("Nama resmi Operator")).toHaveValue("PT Jaya Korpora Prima");

  await page.getByLabel("Nomor WhatsApp CS").fill("0811-2222-3333");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByTestId("pengaturan-operator-form").getByRole("status")).toContainText(
    "Pengaturan Operator disimpan",
  );

  await page.reload();
  const inForce = page.getByTestId("pengaturan-berlaku");
  await expect(inForce).toContainText("PT Jaya Korpora Prima");
  await expect(inForce).toContainText("+6281122223333");
  await expect(inForce).toContainText("dibalas mulai pukul 06:00");
  await expect(page.getByLabel("Nomor WhatsApp CS")).toHaveValue("+6281122223333");
});
