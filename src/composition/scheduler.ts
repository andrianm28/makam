import type { Database } from "@/db/client";
import type { Identity } from "@/domain/identity";
import type { Lokasi } from "@/domain/lokasi";
import type { Notifications } from "@/domain/notifications";
import type { Payouts } from "@/domain/payouts";
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
  payouts: Pick<Payouts, "tick" | "tickTerencana" | "tickPotongan">;
  /**
   * The Pemesanan module, for the two Terencairan money ticks (ticket 37). The worker
   * composes it from the same modules the `web` runtime does, so the worker and the app
   * agree on every number (spec, Architecture: both processes import the same domain
   * modules). It is a whole module rather than a pick because the ticks do domain work
   * with a payment — granting a Hak Pakai, issuing a Bukti Pemesanan — and a pick would
   * be the same module under a narrower name.
   */
  pemesanan: SchedulerContext["pemesanan"];
}): SchedulerContext {
  return {
    db: deps.db,
    paymentEffects: paymentEffects({ clock: deps.clock, dokumenUrl: deps.dokumenUrl }),
    reportError: deps.reportError,
    notifications: deps.notifications,
    pemesanan: deps.pemesanan,
    payouts: deps.payouts,
  };
}
