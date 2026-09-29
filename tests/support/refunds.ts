import type { Database } from "@/db/client";
import { createRefunds, type Refunds } from "@/domain/refunds";
import type { Payouts } from "@/domain/payouts";
import { TEST_PUBLIC_ORIGIN } from "./billing";
import { payoutsOnTestDatabase, type PayoutsModul } from "./payouts";
import type { PublishSetup } from "./publish";

/** The Refunds module on a setup's own Billing, Notifications and Lokasi, next to a Payouts of the caller's choosing. */
export function refundsFor(
  setup: PublishSetup,
  payouts: Pick<Payouts, "batalkanPencairanTagihan" | "kurangiPencairanPesanan" | "sudahDicairkanUntukTagihan" | "catatPotongan">,
): { refunds: Refunds } {
  const refunds = createRefunds({
    db: setup.db,
    clock: setup.clock,
    audit: setup.audit,
    files: setup.files,
    lokasi: setup.lokasi,
    billing: setup.billing,
    payouts,
    notifications: setup.notifications,
    operatorSettings: setup.operatorSettings,
    buktiUrl: (link) => `${TEST_PUBLIC_ORIGIN}/dokumen/${link}`,
  });
  return { refunds };
}

/**
 * Lokasi, Tariffs, Inventory, Field Work, Billing, Notifications, Pemesanan,
 * Payouts and Refunds together on the test Postgres (ticket 31). `payoutsOnTestDatabase`
 * already composes Refunds (its Antrean needs the Tier 3 "refund transfer" row),
 * so this is that setup under the name this ticket's own tests read.
 */
export function refundsOnTestDatabase(db: Database) {
  return payoutsOnTestDatabase(db);
}

export type RefundsSetup = ReturnType<typeof refundsOnTestDatabase>;
export type RefundsModul = PayoutsModul & { refunds: Refunds };

/** The bytes of a transfer proof, as a real upload is. */
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0, 1, 2, 3]);
export const buktiTransfer = { body: jpeg, contentType: "image/jpeg" };
