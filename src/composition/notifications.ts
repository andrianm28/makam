import type { Database } from "@/db/client";
import type { AuditLog } from "@/domain/audit";
import type { Billing } from "@/domain/billing";
import type { Identity } from "@/domain/identity";
import { createNotifications, type Notifications } from "@/domain/notifications";
import type { RuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
import type { Adapters } from "@/ports";
import { documentUrls } from "./billing";

/**
 * Wires the Notifications module on one database: the Peringatan Staf, the
 * family message log, the reminder window and the "Telepon Pemesan" rows the
 * Antrean reads. Billing's Tagihan read comes from Billing's own query, and
 * every family email links to the public site, both given by the caller.
 * Shared by the `web` runtime (src/server/runtime.ts), the worker (which
 * sends the queued messages) and the CLIs.
 */
export function composeNotifications(deps: {
  env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">;
  db: Database;
  adapters: Adapters;
  audit: AuditLog;
  identity: Identity;
  billing: Pick<Billing, "tagihan">;
  reportError: ReportError;
}): Notifications {
  const urls = documentUrls(deps.env);
  return createNotifications({
    db: deps.db,
    clock: deps.adapters.clock,
    email: deps.adapters.email,
    webPush: deps.adapters.webPush,
    identity: deps.identity,
    audit: deps.audit,
    reportError: deps.reportError,
    tagihan: deps.billing,
    dokumenUrl: urls.publicDocumentUrl,
    pesananUrl: urls.pesananUrl,
  });
}
