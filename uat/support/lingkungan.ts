import { join } from "node:path";
import { wibDateOf } from "../../src/lib/time/jakarta";

/*
 * Where the UAT runner may run, and what it reads from its environment.
 *
 * The runner pays and logs in on a real stack, so its first rule is that it never
 * targets production: the base URL must be exactly staging (https://dev.makam.co.id)
 * or a local stack, and a browser request to production is caught wherever a link
 * leads. Pure functions only (no Playwright), so the rules are unit-tested
 * (tests/uat/lingkungan.test.ts).
 */

export const STAGING_ORIGIN = "https://dev.makam.co.id";

const STAGING_HOST = "dev.makam.co.id";
const PRODUCTION_DOMAIN = "makam.co.id";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The base URL the runner was pointed at is not one it may use. */
export class BaseUrlDitolak extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BaseUrlDitolak";
  }
}

function milikMakam(host: string): boolean {
  return host === PRODUCTION_DOMAIN || host.endsWith(`.${PRODUCTION_DOMAIN}`);
}

/**
 * The origin to run against, or a refusal. Only exactly `https://dev.makam.co.id`
 * (default port, no path, no password) and localhost / 127.0.0.1 / [::1] on any
 * port pass; production, look-alike hosts and anything else are refused.
 */
export function pastikanBaseUrlBoleh(url: string | undefined): string {
  const teks = url?.trim();
  if (!teks) {
    throw new BaseUrlDitolak(
      `UAT_BASE_URL belum diisi. Isi dengan ${STAGING_ORIGIN} (staging) atau alamat stack lokal, mis. http://127.0.0.1:3310.`,
    );
  }
  let alamat: URL;
  try {
    alamat = new URL(teks);
  } catch {
    throw new BaseUrlDitolak(`UAT_BASE_URL bukan alamat yang sah: ${teks}`);
  }
  if (alamat.username || alamat.password) {
    throw new BaseUrlDitolak(
      "UAT_BASE_URL tidak boleh memuat kata sandi. Untuk staging yang memakai basic auth, isi UAT_BASIC_AUTH_USER dan UAT_BASIC_AUTH_PASSWORD.",
    );
  }
  if (alamat.pathname !== "/" || alamat.search || alamat.hash) {
    throw new BaseUrlDitolak(`UAT_BASE_URL harus berupa alamat situs saja, tanpa path: ${teks}`);
  }
  const host = alamat.hostname;
  if (LOCAL_HOSTS.has(host)) return alamat.origin;
  if (host === STAGING_HOST) {
    if (alamat.protocol !== "https:" || alamat.port !== "") {
      throw new BaseUrlDitolak(`Staging hanya lewat ${STAGING_ORIGIN} (https, port bawaan), bukan ${teks}`);
    }
    return alamat.origin;
  }
  if (milikMakam(host)) {
    throw new BaseUrlDitolak(
      `UAT ditolak: ${host} bukan staging. Runner tidak pernah dijalankan ke produksi; pakai ${STAGING_ORIGIN} atau stack lokal.`,
    );
  }
  throw new BaseUrlDitolak(`UAT ditolak: ${host} bukan staging (${STAGING_ORIGIN}) maupun stack lokal.`);
}

/**
 * True when a request the browser is about to make goes to a production
 * makam.co.id host (staging itself is `dev.makam.co.id`). The runner aborts such
 * a request: a link that leaks the production address must never be followed.
 */
export function permintaanKeProduksi(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname;
  } catch {
    return false;
  }
  return milikMakam(host) && host !== STAGING_HOST;
}

export interface KonfigurasiUat {
  baseUrl: string;
  /** Basic auth for a staging that has it (never committed: from the environment). */
  basicAuth: { username: string; password: string } | undefined;
  /** `$UAT_OUT`: this run's folder (report, summary, screenshots, `kode/`). */
  out: string;
  /** Where sessions (storageState) and the login history live between runs. */
  sesiDir: string;
}

/**
 * The run's configuration from the environment. `UAT_OUT` names the run folder;
 * without it the folder is `<UAT_RUNS_DIR>/<WIB date>-<sha>` (default
 * `/home/ubuntu/uat-runs`), outside the repository and never committed.
 */
export function bacaKonfigurasi(env: Record<string, string | undefined>, opsi: { sekarang: Date; sha: string }): KonfigurasiUat {
  const baseUrl = pastikanBaseUrlBoleh(env.UAT_BASE_URL);
  const user = env.UAT_BASIC_AUTH_USER?.trim();
  const password = env.UAT_BASIC_AUTH_PASSWORD;
  if (Boolean(user) !== Boolean(password)) {
    throw new Error("UAT_BASIC_AUTH_USER dan UAT_BASIC_AUTH_PASSWORD harus diisi berpasangan.");
  }
  const akar = env.UAT_RUNS_DIR?.trim() || "/home/ubuntu/uat-runs";
  return {
    baseUrl,
    basicAuth: user && password ? { username: user, password } : undefined,
    out: env.UAT_OUT?.trim() || join(akar, `${wibDateOf(opsi.sekarang)}-${opsi.sha}`),
    sesiDir: env.UAT_SESI_DIR?.trim() || join(akar, "sesi"),
  };
}
