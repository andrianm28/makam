import { expect, type Page } from "@playwright/test";
import { langkah } from "./langkah";

/*
 * Paying a Tagihan on staging: Bayar → the SumoPod sandbox checkout → QRIS →
 * "Simulate Payment" (test mode) → the webhook → the Tagihan reads Lunas. The
 * checkout is SumoPod's page, not ours, so its controls are found by their words
 * and a screenshot is kept at every step.
 */

const SEMBUNYIKAN_PEMISAH = /[.,\s]/g;

/** Every number a page shows, reduced to digits ("Rp 3.250.000" -> "3250000"). */
export function angkaDiHalaman(teks: string): string[] {
  return [...teks.matchAll(/\d[\d.,]*/g)].map((cocok) => cocok[0].replace(SEMBUNYIKAN_PEMISAH, ""));
}

/**
 * Pays the Tagihan at `tagihanUrl` (a /dokumen/<link> path) through the sandbox and
 * waits for Lunas on our own page. Returns the total in Rupiah as it was on the button.
 */
export async function bayarDenganQris(page: Page, tagihanUrl: string): Promise<number> {
  const tombolBayar = page.getByRole("button", { name: /^Bayar Rp/ });

  const total = await langkah(page, "Buka Tagihan: Belum Dibayar", async () => {
    await page.goto(tagihanUrl);
    await expect(page.getByText("Belum Dibayar", { exact: true })).toBeVisible();
    await expect(tombolBayar).toBeVisible();
    const nama = (await tombolBayar.textContent()) ?? "";
    return Number(angkaDiHalaman(nama)[0]);
  });

  await langkah(page, "Bayar: dialihkan ke checkout sandbox", async () => {
    await Promise.all([page.waitForURL(/sumopod\.com/, { timeout: 60_000 }), tombolBayar.click()]);
    await page.waitForLoadState("domcontentloaded");
  });

  await langkah(page, "Checkout: jumlah sama dengan total Tagihan", async () => {
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const teks = await page.locator("body").innerText();
    expect.soft(angkaDiHalaman(teks), `checkout menampilkan ${total}`).toContain(String(total));
  });

  await langkah(page, "Checkout: pilih QRIS", async () => {
    const qris = page.getByRole("button", { name: /QRIS/i }).or(page.getByRole("radio", { name: /QRIS/i })).or(page.getByText(/^\s*QRIS\s*$/i)).first();
    await qris.click({ timeout: 30_000 });
  });

  await langkah(page, "Checkout: Simulate Payment", async () => {
    const simulasi = page.getByRole("button", { name: /Simulate Payment/i }).or(page.getByText(/Simulate Payment/i)).first();
    await simulasi.waitFor({ state: "visible", timeout: 45_000 });
    // The checkout's own guidance: let the QR show for a moment before simulating.
    await page.waitForTimeout(3_000);
    await simulasi.click();
    await expect.soft(page.getByText(/waiting for confirmation|menunggu konfirmasi/i)).toBeVisible({ timeout: 30_000 });
  });

  await langkah(page, "Tagihan: Lunas (webhook payment diterima)", async () => {
    await expect(async () => {
      await page.goto(tagihanUrl);
      await expect(page.getByText("Lunas", { exact: true })).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 180_000, intervals: [3_000] });
    await expect(page.getByRole("button", { name: /^Bayar/ })).toHaveCount(0);
  });

  await langkah(page, "Bukti Pembayaran terbit (QRIS)", async () => {
    await page.getByRole("link", { name: "Lihat Bukti Pembayaran" }).click();
    await expect(page.getByRole("heading", { name: "Bukti Pembayaran" })).toBeVisible();
    await expect.soft(page.getByText("Pembayaran online (QRIS)")).toBeVisible();
  });

  return total;
}
