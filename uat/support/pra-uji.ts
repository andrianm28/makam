import type { FullConfig } from "@playwright/test";
import { pastikanLingkunganBoleh } from "./lingkungan";

/*
 * Playwright's globalSetup: it runs once, before any journey. The base URL was already
 * checked by its words (bacaKonfigurasi); here the stack at that address is asked, on
 * /api/health, which environment it is, and the run stops unless it is development,
 * test or staging. A loopback port on the production host passes the first check and
 * fails this one.
 */
export default async function praUji(config: FullConfig): Promise<void> {
  const pakai = config.projects[0]?.use;
  const baseUrl = pakai?.baseURL;
  if (!baseUrl) throw new Error("UAT tidak punya baseURL: periksa uat/playwright.uat.config.ts.");
  const kredensial = Array.isArray(pakai.httpCredentials) ? pakai.httpCredentials[0] : pakai.httpCredentials;
  const environment = await pastikanLingkunganBoleh(baseUrl, {
    ambil: fetch,
    basicAuth: kredensial ? { username: kredensial.username, password: kredensial.password } : undefined,
  });
  console.log(`[UAT] ${baseUrl} mengaku environment ${environment}: boleh dipakai.`);
}
