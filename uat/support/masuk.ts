import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { JedaKodeMasuk } from "./jeda-kode";
import { keluaranDir } from "./keadaan";
import { langkah } from "./langkah";
import { mintaKode } from "./kode";
import { permintaanKeProduksi } from "./lingkungan";
import { PERSONA, berkasSesi, emailPersona, type NamaPersona } from "./persona";

/*
 * Signing a persona in, as sparingly as the server lets us. A saved session is
 * tried first; only a persona with no session (or one that has run out: an
 * Admin Platform's lasts 12 hours) goes through Masuk, and then only after
 * the 60 s / five-an-hour pacing, with the Kode Masuk (and, for an Admin Platform,
 * the authenticator code) read from $UAT_OUT/kode/<persona>.txt.
 */

export const log = (pesan: string) => console.log(`[UAT] ${pesan}`);
export const tidur = (ms: number) => new Promise<void>((selesai) => setTimeout(selesai, ms));

/** The gate every request for an emailed code goes through (the 60 s and five-an-hour limits). */
export function jedaKode(): JedaKodeMasuk {
  return new JedaKodeMasuk({
    berkas: join(sesiDir(), "riwayat-kode.json"),
    sekarang: () => Date.now(),
    tidur,
    catat: log,
    maksTungguMs: Number(process.env.UAT_KODE_TUNGGU_MAKS_MENIT ?? 10) * 60_000,
  });
}

/** How long the runner waits for the owner to read a code out. */
export const timeoutKodeMs = () => Number(process.env.UAT_KODE_TIMEOUT_MENIT ?? 15) * 60_000;

function sesiDir(): string {
  const dir = process.env.UAT_SESI_DIR;
  if (!dir) throw new Error("UAT_SESI_DIR belum ditetapkan: jalankan lewat `npm run uat`.");
  return dir;
}

/** A browser context with the project's settings, that refuses any request to production. */
export async function konteksBaru(browser: Browser, storageState?: string): Promise<BrowserContext> {
  const { baseURL, httpCredentials, locale, timezoneId } = test.info().project.use;
  const context = await browser.newContext({ baseURL, httpCredentials, locale, timezoneId, storageState, viewport: { width: 1280, height: 900 }, permissions: ["camera", "microphone"] });
  await context.route(
    (url) => permintaanKeProduksi(url.toString()),
    (route) => route.abort("blockedbyclient"),
  );
  return context;
}

async function sesiMasihBerlaku(page: Page, nama: NamaPersona): Promise<boolean> {
  await page.goto(PERSONA[nama].halamanTerlindungi);
  return !/^\/(masuk|staf\/totp)/.test(new URL(page.url()).pathname);
}

/** What the Masuk journey checks on the way, beyond signing in. */
export interface PeriksaMasuk {
  /** Type a wrong Kode Masuk first and expect the "kode salah" message. */
  kodeSalahDulu?: boolean;
  /** Check that Kirim ulang kode is held back for its cooldown. */
  jedaKirimUlang?: boolean;
  /** An Admin Platform types a wrong authenticator code first and expects the message. */
  totpSalahDulu?: boolean;
}

export async function masukDenganKode(page: Page, nama: NamaPersona, periksa: PeriksaMasuk = {}): Promise<void> {
  const email = emailPersona(nama);
  const jeda = jedaKode();
  const dir = join(keluaranDir(), "kode");

  await langkah(page, `Masuk sebagai ${nama}: Kirim Kode Masuk`, async () => {
    await page.goto("/masuk");
    await page.getByLabel("Email").fill(email);
  });
  const kode = await mintaKode({
    dir,
    persona: nama,
    jenis: "kode-masuk",
    timeoutMs: timeoutKodeMs(),
    sekarang: () => Date.now(),
    tidur,
    catat: log,
    kirim: async () => {
      await jeda.sebelumMintaKode();
      await page.getByRole("button", { name: "Kirim Kode Masuk" }).click();
      await expect(page.getByTestId("kode-masuk-email")).toHaveText(email, { timeout: 30_000 });
      if (periksa.jedaKirimUlang) {
        await expect.soft(page.getByRole("button", { name: /Kirim ulang kode \(\d+ detik\)/ })).toBeDisabled();
      }
    },
  });
  if (periksa.kodeSalahDulu) {
    await langkah(page, `Masuk sebagai ${nama}: kode salah ditolak`, async () => {
      await page.getByLabel("Kode Masuk").fill(kode === "000000" ? "111111" : "000000");
      await page.getByRole("button", { name: "Masuk" }).click();
      await expect(page.getByText("Kode salah. Periksa lagi kode di email Anda.")).toBeVisible();
      await expect(page).toHaveURL(/\/masuk/);
    });
  }
  await langkah(page, `Masuk sebagai ${nama}: Kode Masuk benar`, async () => {
    await page.getByLabel("Kode Masuk").fill(kode);
    await page.getByRole("button", { name: "Masuk" }).click();
    await expect(page).toHaveURL(/\/(akun|staf)/, { timeout: 30_000 });
  });

  if (PERSONA[nama].totp && new URL(page.url()).pathname.endsWith("/staf/totp")) {
    if (await page.getByRole("button", { name: "Daftarkan aplikasi authenticator" }).isVisible()) {
      throw new Error(`TOTP persona ${nama} belum didaftarkan. Daftarkan authenticator-nya lebih dulu secara manual (checklist Rilis 1, bagian 0).`);
    }
    const totp = await mintaKode({
      dir,
      persona: nama,
      jenis: "totp",
      timeoutMs: timeoutKodeMs(),
      sekarang: () => Date.now(),
      tidur,
      catat: log,
      kirim: async () => {},
    });
    if (periksa.totpSalahDulu) {
      await langkah(page, `Masuk sebagai ${nama}: kode authenticator salah ditolak`, async () => {
        await page.getByLabel("Kode authenticator").fill(totp === "000000" ? "111111" : "000000");
        await page.getByRole("button", { name: "Verifikasi" }).click();
        await expect(page.getByText("Kode authenticator salah")).toBeVisible();
      });
    }
    await langkah(page, `Masuk sebagai ${nama}: kode authenticator benar`, async () => {
      await page.getByLabel("Kode authenticator").fill(totp);
      await page.getByRole("button", { name: "Verifikasi" }).click();
      await expect(page).toHaveURL(/\/staf\/admin-platform/, { timeout: 30_000 });
    });
  }
}

/** Saves a persona's session, so the next journey and the next run need no new Kode Masuk. */
export async function simpanSesi(context: BrowserContext, nama: NamaPersona): Promise<void> {
  const berkas = berkasSesi(sesiDir(), nama);
  mkdirSync(dirname(berkas), { recursive: true, mode: 0o700 });
  await context.storageState({ path: berkas });
  chmodSync(berkas, 0o600);
}

/**
 * A page signed in as `nama`: from the saved session when it still works,
 * otherwise through Masuk (the session is then saved for the next journey and the
 * next run).
 */
export async function pastikanMasuk(browser: Browser, nama: NamaPersona): Promise<{ page: Page; context: BrowserContext }> {
  const berkas = berkasSesi(sesiDir(), nama);
  if (existsSync(berkas)) {
    const context = await konteksBaru(browser, berkas);
    const page = await context.newPage();
    if (await sesiMasihBerlaku(page, nama)) return { page, context };
    log(`Sesi ${nama} sudah habis: masuk lagi dengan Kode Masuk.`);
    await context.close();
  }
  const context = await konteksBaru(browser);
  const page = await context.newPage();
  await masukDenganKode(page, nama);
  await simpanSesi(context, nama);
  return { page, context };
}
