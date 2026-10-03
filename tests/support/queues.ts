import type { Database } from "@/db/client";
import { createWakaf } from "@/domain/wakaf";
import { suratKuasaDeps } from "./surat-kuasa";
import { createQueues } from "@/domain/queues";
import { composeLayanan } from "@/composition/layanan";
import { composePemesanan } from "@/composition/pemesanan";
import { refundsTertunda } from "@/composition/refunds";
import { createPengurusan } from "@/domain/pengurusan";
import { createPerpanjangan } from "@/domain/perpanjangan";
import { payoutsFor } from "./payouts";
import { refundsFor } from "./refunds";
import type { PengurusanDikonfirmasiInput } from "@/domain/notifications";
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
  const { payouts } = payoutsFor(setup);
  const refundsMenunggu = refundsTertunda();
  const pemesanan = composePemesanan({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing: setup.billing,
    payouts,
    identity: setup.identity,
    notifications: setup.notifications,
    refunds: refundsMenunggu.refunds,
  });
  const { refunds } = refundsFor(setup, payouts);
  refundsMenunggu.sambungkan(refunds);
  // The Antrean's Layanan rows (ticket 50) read the Layanan module's own public reads, so it is
  // composed here beside the rest: it needs Inventory, Billing and Identity, all of which this
  // fixture already has.
  const layanan = composeLayanan({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing: setup.billing,
    identity: setup.identity,
    refunds,
    payouts,
    notifications: setup.notifications,
  });
  // Ticket 44 joined the tree: the Antrean Lokasi setup now lives beside the
  // Pengurusan module, and ticket 45 gave the Antrean a Tier 1 row that reads it,
  // so the queue is composed after it and holds it. Its family message is
  // recorded rather than sent, the way the Pemesanan fixture records its own, so
  // a test can read what a confirmation announced.
  const dikonfirmasiTpu: PengurusanDikonfirmasiInput[] = [];
  const pengurusan = createPengurusan({
    db,
    clock: setup.clock,
    files: setup.files,
    ...suratKuasaDeps(),
    audit: setup.audit,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    billing: setup.billing,
    identity: setup.identity,
    fieldwork: setup.fieldwork,
    layanan,
    notifikasi: {
      tagihanTerbit: async () => ({ ok: true as const, diingatkan: 0 }),
      pengurusanDikonfirmasi: async (hasil) => {
        dikonfirmasiTpu.push(hasil);
        return { ok: true };
      },
      iptmTerbit: async () => ({ ok: true }),
      tutupTeleponPemesanSubjek: async () => undefined,
    },
    refunds: refundsMenunggu.refunds,
  });
  const perpanjangan = createPerpanjangan({
    db,
    clock: setup.clock,
    lokasi: setup.lokasi,
    tariffs: setup.tariffs,
    inventory: setup.inventory,
    billing: setup.billing,
    pemesanan,
    identity: setup.identity,
    files: setup.files,
    audit: setup.audit,
    notifikasi: setup.notifications,
  });
  const wakaf = createWakaf({
    db,
    clock: setup.clock,
    files: setup.files,
    audit: setup.audit,
    lokasi: setup.lokasi,
    fieldwork: setup.fieldwork,
    notifikasi: setup.notifications,
  });
  const queues = createQueues({
    db,
    clock: setup.clock,
    audit: setup.audit,
    wakaf,
    identity: setup.identity,
    lokasi: setup.lokasi,
    fieldwork: setup.fieldwork,
    billing: setup.billing,
    notifications: setup.notifications,
    inventory: setup.inventory,
    pemesanan,
    layanan,
    payouts,
    pengurusan,
    perpanjangan,
    refunds,
  });
  return { ...setup, pemesanan, pengurusan, perpanjangan, payouts, refunds, layanan, wakaf, queues, pengurusanDikonfirmasi: dikonfirmasiTpu };
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
