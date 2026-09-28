import type { Database } from "@/db/client";
import type { Identity } from "@/domain/identity";
import type { Inventory } from "@/domain/inventory";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { PemesananNotifikasi } from "@/domain/pemesanan";
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
  notifications: Pick<Notifications, "kirimPesanJatuhTempo">;
  lokasi: Pick<Lokasi, "serviceHoursDeadline" | "kontakSiagaOf">;
  identity: Pick<Identity, "adminLokasiOf">;
  inventory: Pick<Inventory, "hakPakaiOfUnit">;
  notifikasi: PemesananNotifikasi;
}): SchedulerContext {
  return {
    db: deps.db,
    paymentEffects: paymentEffects({ clock: deps.clock, dokumenUrl: deps.dokumenUrl, layanan: { db: deps.db, inventory: deps.inventory } }),
    reportError: deps.reportError,
    notifications: deps.notifications,
    pemesanan: { db: deps.db, clock: deps.clock, lokasi: deps.lokasi, identity: deps.identity, notifikasi: deps.notifikasi },
    inventory: deps.inventory,
  };
}
