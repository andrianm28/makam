import type { Database } from "@/db/client";
import { createQueues } from "@/domain/queues";
import { publishOnTestDatabase } from "./publish";

/**
 * Work Queues next to Lokasi, Tariffs, Inventory and Field Work on the test
 * Postgres, sharing the one fake Clock, FileStore, Identity and Audit Log
 * (ticket 17: the Antrean's Tier 4 Lokasi rows need the whole publish path).
 */
export function queuesOnTestDatabase(db: Database) {
  const setup = publishOnTestDatabase(db);
  const queues = createQueues({
    db,
    clock: setup.clock,
    audit: setup.audit,
    lokasi: setup.lokasi,
    fieldwork: setup.fieldwork,
    billing: setup.billing,
    notifications: setup.notifications,
  });
  return { ...setup, queues };
}

export type QueuesSetup = ReturnType<typeof queuesOnTestDatabase>;

export {
  jenisMakamInput,
  newLokasiMitra,
  publishedLokasiMitra,
  readyToPublish,
  signedInAdminLokasi,
  signedInAdminPlatform,
  signedInPetugasLapangan,
  tariffsCheckedFact,
} from "./publish";
