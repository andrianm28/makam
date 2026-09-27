import type { Database } from "@/db/client";
import type { Notifications } from "@/domain/notifications";
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
}): SchedulerContext {
  return {
    db: deps.db,
    paymentEffects: paymentEffects({ clock: deps.clock, dokumenUrl: deps.dokumenUrl }),
    reportError: deps.reportError,
    notifications: deps.notifications,
  };
}
