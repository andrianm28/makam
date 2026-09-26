import type { Database } from "@/db/client";
import { createTariffs } from "@/domain/tariffs";
import { lokasiOnTestDatabase } from "./lokasi";

/** The Tariffs module on the test Postgres, next to the Lokasi module, sharing its fake Clock and Audit Log. */
export function tariffsOnTestDatabase(db: Database) {
  const setup = lokasiOnTestDatabase(db);
  const tariffs = createTariffs({ db, clock: setup.clock, audit: setup.audit, lokasi: setup.lokasi });
  return { ...setup, tariffs };
}

export type TariffsSetup = ReturnType<typeof tariffsOnTestDatabase>;

export { newLokasiMitra, signedInAdminLokasi, signedInAdminPlatform } from "./lokasi";
