import type { Database } from "@/db/client";
import type { PaymentEffect } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import type { Layanan } from "@/domain/layanan";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Pemesanan, PemesananNotifikasi } from "@/domain/pemesanan";
import type { Payouts } from "@/domain/payouts";
import type { QueuesTicks } from "@/domain/queues";
import type { Refunds } from "@/domain/refunds";
import type { SchedulerContext } from "@/domain/scheduler";
import type { ReportError } from "@/lib/observability/report-error";
import type { Clock } from "@/ports/clock";
import { paymentEffects } from "./billing";

/** What the worker gives every tick: the database and the same registries the `web` runtime is composed with. */
export function composeSchedulerContext(deps: {
  db: Database;
  reportError: ReportError;
  clock: Clock;
  dokumenUrl: (link: string) => string;
  /** The same payment-effect registry the `web` runtime holds, so a retried effect behaves identically (ticket 25). */
  paymentEffects?: readonly PaymentEffect[];
  notifications: Pick<Notifications, "kirimPesanJatuhTempo" | "chasingEskalasiTick" | "kirimPeringatanAntreanTick">;
  lokasi: Pick<Lokasi, "serviceHoursDeadline" | "kontakSiagaOf">;
  identity: Pick<Identity, "adminLokasiOf">;
  inventory: Pick<Inventory, "hakPakaiOfUnit">;
  notifikasi: PemesananNotifikasi;
  payouts: Pick<Payouts, "tick" | "tickPotongan">;
  refunds: Pick<Refunds, "tick">;
  layanan: Pick<Layanan, "tinjauSkorTick" | "tandaiTidakDirespons" | "tutupJendelaKeluhan">;
  /** The Pemesanan module, for the Terencana payment-hold lapse (ticket 37). */
  terencana: Pick<Pemesanan, "lewatBatasBayarTick">;
  /** The Antrean's Tier 1 alert tick and the Bertugas auto-off (ticket 28), from `createQueuesTicks`. */
  queues: QueuesTicks;
}): SchedulerContext {
  return {
    db: deps.db,
    paymentEffects: deps.paymentEffects ?? paymentEffects({ clock: deps.clock, dokumenUrl: deps.dokumenUrl, layanan: { db: deps.db, inventory: deps.inventory } }),
    reportError: deps.reportError,
    notifications: deps.notifications,
    pemesanan: { db: deps.db, clock: deps.clock, lokasi: deps.lokasi, identity: deps.identity, notifikasi: deps.notifikasi },
    payouts: deps.payouts,
    refunds: deps.refunds,
    layanan: deps.layanan,
    terencana: deps.terencana,
    queues: deps.queues,
    inventory: deps.inventory,
  };
}
