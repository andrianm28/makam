import { expect, type Page } from "@playwright/test";
import { langkah } from "./langkah";
import { HOST_CHECKOUT_SANDBOX, checkoutSandboxSumopod } from "./lingkungan";

/*
 * Paying a Tagihan on staging: Bayar → the SumoPod sandbox checkout → "Simulate Payment" (test mode) → the webhook →
 * the Tagihan reads Lunas → Bukti Pembayaran. The app asks SumoPod for QRIS alone, so the checkout opens on the QR with
 * no method to choose, and the link in its test-mode banner simulates the payment at once and sends the browser back to
 * the Tagihan (2026-10-04). The checkout is SumoPod's page, not ours, so its controls are found by their words and a
 * screenshot is kept at every step.
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
  // A method choice exists only on a checkout that offers more than QRIS; the app asks for QRIS alone, so the QR is normally showing at once.
  const pilihanQris = page
    .getByRole("button", { name: /QRIS/i })
    .or(page.getByRole("radio", { name: /QRIS/i }))
    .or(page.getByText(/^\s*QRIS\s*$/i))
    .first();
  // The link in the test-mode banner ("Click here to simulate your payment", 2026-10-04); an older checkout had a "Simulate Payment" button.
  const simulasi = page
    .getByRole("link", { name: /simulate your payment/i })
    .or(page.getByRole("button", { name: /Simulate Payment/i }))
    .or(page.getByText(/simulate your payment|Simulate Payment/i))
    .first();

  const total = await langkah(page, "Buka Tagihan: Belum Dibayar", async () => {
    await page.goto(tagihanUrl);
    await expect(page.getByText("Belum Dibayar", { exact: true })).toBeVisible();
    await expect(tombolBayar).toBeVisible();
    const nama = (await tombolBayar.textContent()) ?? "";
    return Number(angkaDiHalaman(nama)[0]);
  });

  await langkah(page, "Bayar: dialihkan ke checkout sandbox", async () => {
    // The sandbox checkout by its exact host: a Bayar that lands on any other SumoPod host is a finding, not a pass.
    await Promise.all([page.waitForURL((url) => checkoutSandboxSumopod(url.toString()), { timeout: 60_000 }), tombolBayar.click()]);
    expect(new URL(page.url()).hostname).toBe(HOST_CHECKOUT_SANDBOX);
    await page.waitForLoadState("domcontentloaded");
  });

  await langkah(page, "Checkout: jumlah sama dengan total Tagihan", async () => {
    await page.waitForLoadState("networkidle").catch(() => undefined);
    const teks = await page.locator("body").innerText();
    expect.soft(angkaDiHalaman(teks), `checkout menampilkan ${total}`).toContain(String(total));
  });

  await langkah(page, "Checkout: pilih QRIS bila ada pilihan", async () => {
    // Settled when the checkout shows its QR page (the banner link) or a method choice; the choice is clicked only if it is there.
    await pilihanQris.or(simulasi).first().waitFor({ state: "visible", timeout: 30_000 });
    if (await pilihanQris.isVisible()) await pilihanQris.click();
  });

  await langkah(page, "Checkout: Simulate Payment", async () => {
    await simulasi.waitFor({ state: "visible", timeout: 45_000 });
    // The checkout's own guidance: let the QR show for a moment before simulating.
    await page.waitForTimeout(3_000);
    await simulasi.click();
    // The sandbox simulates at once and sends the browser back to this Tagihan's page (2026-10-04). Whether it already reads Lunas is for the next
    // step, which reloads until it does.
    await expect
      .soft.poll(() => !checkoutSandboxSumopod(page.url()) && new URL(page.url()).pathname === tagihanUrl, {
        message: "setelah Simulate Payment peramban kembali ke halaman Tagihan",
        timeout: 30_000,
      })
      .toBe(true);
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
