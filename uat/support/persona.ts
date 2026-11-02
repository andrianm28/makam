import { join } from "node:path";

/*
 * The personas of a UAT run: each is one email (the owner's Gmail plus-aliases,
 * given in the environment, never committed) with its own saved session
 * (storageState), so a persona logs in once and every later journey, and every
 * re-run, reuses the session instead of asking for another Kode Masuk.
 */

export interface DefinisiPersona {
  /** The role as the owner knows it. */
  peran: string;
  /** The environment variable that holds the persona's email. */
  env: string;
  /** A page that only this persona's session opens: a redirect to /masuk means the session is gone. */
  halamanTerlindungi: string;
}

export const PERSONA = {
  pemesan: { peran: "Pemesan (keluarga)", env: "UAT_EMAIL_PEMESAN", halamanTerlindungi: "/akun" },
  "admin-lokasi": { peran: "Admin Lokasi", env: "UAT_EMAIL_ADMIN_LOKASI", halamanTerlindungi: "/staf/admin-lokasi" },
  "admin-platform": { peran: "Admin Platform", env: "UAT_EMAIL_ADMIN_PLATFORM", halamanTerlindungi: "/staf/admin-platform" },
  "petugas-lapangan": {
    peran: "Petugas Lapangan",
    env: "UAT_EMAIL_PETUGAS_LAPANGAN",
    halamanTerlindungi: "/staf/petugas-lapangan/tugas",
  },
  "mitra-jasa": { peran: "Mitra Jasa", env: "UAT_EMAIL_MITRA_JASA", halamanTerlindungi: "/staf/mitra-jasa/pekerjaan" },
} as const satisfies Record<string, DefinisiPersona>;

export type NamaPersona = keyof typeof PERSONA;

/** The persona's email from the environment, or an error that says which variable to set. */
export function emailPersona(nama: NamaPersona, env: Record<string, string | undefined> = process.env): string {
  const { env: variabel, peran } = PERSONA[nama];
  const email = env[variabel]?.trim();
  if (!email) throw new Error(`Persona "${nama}" (${peran}) belum punya email: isi ${variabel} dengan alias Gmail milik owner.`);
  return email.toLowerCase();
}

/** Whether the environment holds this persona's email: a journey that needs a persona the owner did not provide skips, and says so. */
export function punyaPersona(nama: NamaPersona, env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env[PERSONA[nama].env]?.trim());
}

/** Where a persona's session is kept between runs. */
export function berkasSesi(sesiDir: string, nama: NamaPersona): string {
  return join(sesiDir, `${nama}.json`);
}
