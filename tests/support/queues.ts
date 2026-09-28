import type { Database } from "@/db/client";
import { composePemesanan } from "@/composition/pemesanan";
import { createQueues } from "@/domain/queues";
import { createPengurusan } from "@/domain/pengurusan";
import { payoutsFor } from "./payouts";
import { publishOnTestDatabase } from "./publish";

/**
 * Work Queues next to Lokasi, Tariffs, Inventory, Field Work, Billing,
 * Notifications and the Pemesanan module on the test Postgres, sharing the one
 * fake Clock, FileStore, Identity and Audit Log (ticket 17's Tier 4 Lokasi rows
 * need the whole publish path; ticket 23's confirmation rows need the Pemesanan
 * module beside them).
 */
export function queuesOnTestDatabase(db: Database) {
  const setup = publishOnTestDatabase(db);
  const pemesanan = composePemesanan({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing: setup.billing,
    identity: setup.identity,
    notifications: setup.notifications,
  });
  const { payouts } = payoutsFor(setup);
  const queues = createQueues({
    db,
    clock: setup.clock,
    audit: setup.audit,
    lokasi: setup.lokasi,
    fieldwork: setup.fieldwork,
    billing: setup.billing,
    notifications: setup.notifications,
    inventory: setup.inventory,
    pemesanan,
    payouts,
  });
  // Ticket 44 joined the tree: the Antrean Lokasi setup now lives beside the
  // Pengurusan module, which the shared Pemesanan fixture type requires.
  const pengurusan = createPengurusan({
    db,
    clock: setup.clock,
    files: setup.files,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    billing: setup.billing,
    identity: setup.identity,
  });
  return { ...setup, pemesanan, pengurusan, payouts, queues };
}

export type QueuesSetup = ReturnType<typeof queuesOnTestDatabase>;
export type AntreanLokasiSetup = QueuesSetup;

export {
  jenisMakamInput,
  newLokasiMitra,
  newTpuDki,
  publishedLokasiMitra,
  readyToPublish,
  signedInAdminLokasi,
  signedInAdminPlatform,
  signedInPetugasLapangan,
  tariffsCheckedFact,
} from "./publish";
