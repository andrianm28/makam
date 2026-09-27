import type { Database } from "@/db/client";
import type { PaymentEffect } from "@/domain/billing";
import type { Notifications } from "@/domain/notifications";
import type { SchedulerContext } from "@/domain/scheduler";
import type { ReportError } from "@/lib/observability/report-error";

/**
 * The worker's scheduler context for a test that drives one tick by hand: the
 * parts it leaves out are the ones its tick never reads, and by default
 * `notifications.kirim_pesan` sends nothing, so a test of another module's
 * tick is not disturbed by it.
 */
export function schedulerContext(parts: {
  db: Database;
  paymentEffects?: readonly PaymentEffect[];
  reportError?: ReportError;
  notifications?: Pick<Notifications, "kirimPesanJatuhTempo">;
}): SchedulerContext {
  return {
    db: parts.db,
    paymentEffects: parts.paymentEffects ?? [],
    reportError: parts.reportError ?? (() => {}),
    notifications: parts.notifications ?? { kirimPesanJatuhTempo: async () => ({ terkirim: 0, gagal: 0, ditunda: 0, dibatalkan: 0 }) },
  };
}
