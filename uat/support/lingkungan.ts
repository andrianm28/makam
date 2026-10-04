import { join } from "node:path";
import { z } from "zod";
import { wibDateOf } from "../../src/lib/time/jakarta";
import { JEDA_ANTAR_KODE_MS, MARGIN_BAWAAN_MS } from "./jeda-kode";

/*
 * Where the UAT runner may run, and what it reads from its environment.
 *
 * The runner pays and logs in on a real stack, so its first rule is that it never
 * targets production. Three guards, each alone enough for one way of getting there:
 * the base URL must be exactly staging (https://dev.makam.co.id) or a local stack;
 * the stack at that address must itself say, on /api/health, that it is development,
 * test or staging (a loopback port on the production host is a "local stack" to the
 * URL check, and production listens on 127.0.0.1:3100 there); and a browser request
 * to production is caught wherever a link leads. No Playwright in here, so the rules
 * are unit-tested (tests/uat/lingkungan.test.ts).
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

/** A fully qualified host name may end in a dot (`makam.co.id.`): the same host as without it. */
function tanpaTitikAkhir(host: string): string {
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

function milikMakam(host: string): boolean {
  const nama = tanpaTitikAkhir(host);
  return nama === PRODUCTION_DOMAIN || nama.endsWith(`.${PRODUCTION_DOMAIN}`);
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
    host = tanpaTitikAkhir(new URL(url).hostname);
  } catch {
    return false;
  }
  return milikMakam(host) && host !== STAGING_HOST;
}

/** The only host the runner pays on: SumoPod's sandbox checkout, by its exact name (not a suffix, not the live checkout). */
export const HOST_CHECKOUT_SANDBOX = "pay-sandbox.sumopod.com";

export function checkoutSandboxSumopod(url: string): boolean {
  try {
    return tanpaTitikAkhir(new URL(url).hostname) === HOST_CHECKOUT_SANDBOX;
  } catch {
    return false;
  }
}

/** What GET /api/health needs from `fetch`: the runner's own seam, so the guard is tested without a network. */
export type AmbilHealth = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<{ status: number; json: () => Promise<unknown> }>;

const LINGKUNGAN_BOLEH = ["development", "test", "staging"] as const;
export type LingkunganUat = (typeof LINGKUNGAN_BOLEH)[number];

const laporanHealth = z.object({ environment: z.string().nullable() });

/**
 * Asks the stack at `baseUrl` which environment it is (`environment` in GET /api/health, the APP_ENV
 * of its process) and refuses unless it says development, test or staging. This is what stops a loopback
 * port that reaches production: the base URL check cannot tell 127.0.0.1:3100 (production) from 127.0.0.1:3310
 * (a local stack), the stack can. It refuses to guess: no answer, an answer that is not the health report and an
 * environment it does not know are all refused. A 503 (stale worker beat) with a known environment is accepted:
 * this settles where the stack is, not whether it is well.
 */
export async function pastikanLingkunganBoleh(
  baseUrl: string,
  opsi: { ambil: AmbilHealth; basicAuth?: { username: string; password: string } },
): Promise<LingkunganUat> {
  const alamat = `${baseUrl}/api/health`;
  const headers: Record<string, string> = {};
  if (opsi.basicAuth) headers.authorization = `Basic ${Buffer.from(`${opsi.basicAuth.username}:${opsi.basicAuth.password}`).toString("base64")}`;
  const tidakPasti = (sebab: string) =>
    new BaseUrlDitolak(
      `UAT ditolak: ${alamat} ${sebab}. Runner hanya jalan bila stack itu sendiri mengaku development, test atau staging, supaya ia tidak pernah menyentuh produksi.`,
    );

  let status: number;
  let isi: unknown;
  try {
    const jawaban = await opsi.ambil(alamat, { headers, signal: AbortSignal.timeout(10_000) });
    status = jawaban.status;
    isi = await jawaban.json();
  } catch (error) {
    throw tidakPasti(`tidak menjawab dengan laporan health (${error instanceof Error ? error.message : "galat tak dikenal"})`);
  }
  const laporan = laporanHealth.safeParse(isi);
  if (!laporan.success || laporan.data.environment === null) {
    throw tidakPasti(`membalas ${status} tanpa environment yang bisa dibaca (konfigurasinya tidak terbaca, atau ini bukan aplikasi Makam)`);
  }
  const environment = laporan.data.environment;
  if (environment === "production") {
    throw new BaseUrlDitolak(
      `UAT ditolak: ${baseUrl} mengaku environment produksi (production). Runner tidak pernah dijalankan ke produksi, juga bukan lewat port lokal di host yang sama.`,
    );
  }
  if (!(LINGKUNGAN_BOLEH as readonly string[]).includes(environment)) {
    throw tidakPasti(`mengaku environment "${environment}", yang tidak dikenal runner`);
  }
  return environment as LingkunganUat;
}

export interface KonfigurasiUat {
  baseUrl: string;
  /** Basic auth for a staging that has it (never committed: from the environment), tied to the base URL's origin. */
  basicAuth: { username: string; password: string; origin: string } | undefined;
  /** How long the runner waits by itself for the hour's limit on Kode Masuk requests, in minutes (`UAT_KODE_TUNGGU_MAKS_MENIT`). */
  kodeTungguMaksMenit: number;
  /** How long a code may take to be read out, in minutes (`UAT_KODE_TIMEOUT_MENIT`). */
  kodeTimeoutMenit: number;
  /** `$UAT_OUT`: this run's folder (report, summary, screenshots, `kode/`). */
  out: string;
  /** Where sessions (storageState) and the login history live between runs. */
  sesiDir: string;
}

/** Minutes from a variable: its default when it is empty, an error naming the variable when it is not a number of at least `minimal`. */
function menitDariEnv(nama: string, teks: string | undefined, bawaan: number, minimal: number): number {
  const isi = teks?.trim();
  if (!isi) return bawaan;
  const angka = Number(isi);
  if (!Number.isFinite(angka) || angka < minimal) {
    throw new Error(`${nama} harus berupa angka menit, paling sedikit ${minimal} (diisi: "${isi}").`);
  }
  return angka;
}

/**
 * The patience for emailed codes. The wait for the hour's limit must outlast the 60 s gap between two
 * requests (plus its margin), or every wait would be refused as if the hour were full.
 */
export function bacaKesabaranKode(env: Record<string, string | undefined>): { tungguMaksMenit: number; timeoutMenit: number } {
  const jedaMenit = Math.ceil((JEDA_ANTAR_KODE_MS + MARGIN_BAWAAN_MS) / 60_000);
  return {
    tungguMaksMenit: menitDariEnv("UAT_KODE_TUNGGU_MAKS_MENIT", env.UAT_KODE_TUNGGU_MAKS_MENIT, 10, jedaMenit),
    timeoutMenit: menitDariEnv("UAT_KODE_TIMEOUT_MENIT", env.UAT_KODE_TIMEOUT_MENIT, 15, 1),
  };
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
  const kesabaran = bacaKesabaranKode(env);
  return {
    baseUrl,
    basicAuth: user && password ? { username: user, password, origin: baseUrl } : undefined,
    kodeTungguMaksMenit: kesabaran.tungguMaksMenit,
    kodeTimeoutMenit: kesabaran.timeoutMenit,
    out: env.UAT_OUT?.trim() || join(akar, `${wibDateOf(opsi.sekarang)}-${opsi.sha}`),
    sesiDir: env.UAT_SESI_DIR?.trim() || join(akar, "sesi"),
  };
}
