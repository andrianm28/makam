import type { Database } from "@/db/client";
import type { Actor } from "@/domain/identity";
import { createLayanan as createLayananModule, type NewLayanan } from "@/domain/layanan";
import { publishOnTestDatabase, publishedLokasiMitra, newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "./publish";
import { setLokasiMitraStatusForTest } from "./lokasi";
/**
 * The Layanan module on the test Postgres, next to Tariffs, Lokasi and the publish
 * path (so a test can take a Lokasi Mitra all the way to Terverifikasi and read
 * the prices its public page shows), sharing their fake Clock and Audit Log.
 */
export function layananOnTestDatabase(db: Database) {
  const setup = publishOnTestDatabase(db);
  const layanan = createLayananModule({ db, clock: setup.clock, audit: setup.audit, lokasi: setup.lokasi, tariffs: setup.tariffs });
  return { ...setup, layanan };
}

export type LayananSetup = ReturnType<typeof layananOnTestDatabase>;

export { newLokasiMitra, publishedLokasiMitra, setLokasiMitraStatusForTest, signedInAdminLokasi, signedInAdminPlatform };

/** A Layanan of the v1 catalog, typed as an Admin Platform would enter it. */
export function newLayananInput(overrides: Partial<NewLayanan> = {}): NewLayanan {
  return {
    name: "Pembersihan Makam",
    description: "Membersihkan dan merapikan makam.",
    bukti: "foto_sebelum_dan_sesudah",
    leadTimeDays: 3,
    bisaHariH: false,
    adaDiPetakKosong: true,
    teksLabel: null,
    varian: ["Reguler"],
    reason: null,
    ...overrides,
  };
}

/** A Layanan in the catalog, created by `admin`, with its first variant's id. */
export async function newLayananFor(setup: LayananSetup, admin: Actor, overrides: Partial<NewLayanan> = {}) {
  const created = await setup.layanan.createLayanan(admin, newLayananInput(overrides));
  if (!created.ok) throw new Error(`Layanan refused: ${created.reason}`);
  return { layanan: created.layanan, varian: created.layanan.varian[0] };
}

/** A Layanan in the catalog, with a signed-in Admin Platform who made it. */
export async function catalogFixture(setup: LayananSetup, overrides: Partial<NewLayanan> = {}) {
  const { actor: admin } = await signedInAdminPlatform(setup);
  return { admin, ...(await newLayananFor(setup, admin, overrides)) };
}
