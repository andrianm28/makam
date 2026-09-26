import type { Database } from "@/db/client";
import type { SchedulerContext } from "@/domain/scheduler";
import type { ReportError } from "@/lib/observability/report-error";
import { paymentEffects } from "./billing";

/** What the worker gives every tick: the database and the same registries the `web` runtime is composed with. */
export function composeSchedulerContext(deps: { db: Database; reportError: ReportError }): SchedulerContext {
  return { db: deps.db, paymentEffects: paymentEffects(), reportError: deps.reportError };
}
