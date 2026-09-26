import type { Database } from "@/db/client";
import { createBilling, type Billing, type PaymentEffect } from "@/domain/billing";
import type { OperatorSettings } from "@/domain/operator-settings";
import { documentPagePath } from "@/lib/document-links";
import type { RuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
import type { Adapters } from "@/ports";

/**
 * The downstream effects of a payment (spec, Billing: Bukti Pemesanan /
 * Perpanjangan, Pencairan due, Pekerjaan Layanan scheduled, Hak Pakai
 * extended or created). The modules that own them register them here, the one
 * registry both the `web` runtime and the worker's retry tick use. None yet.
 */
export function paymentEffects(): readonly PaymentEffect[] {
  return [];
}

/** Where a document's page lives: inside the container for the PdfRenderer, on the public site for payers. */
export function documentUrls(env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">) {
  const publicOrigin = new URL(env.APP_BASE_URL).origin;
  return {
    documentPageUrl: (link: string) => `${env.documentPageOrigin}${documentPagePath(link)}`,
    publicDocumentUrl: (link: string) => `${publicOrigin}${documentPagePath(link)}`,
  };
}

/** Billing wired on one database: shared by the `web` runtime, its test twin and the CLIs. */
export function composeBilling(deps: {
  env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">;
  db: Database;
  adapters: Adapters;
  operatorSettings: Pick<OperatorSettings, "current">;
  reportError: ReportError;
}): Billing {
  return createBilling({
    db: deps.db,
    clock: deps.adapters.clock,
    operatorSettings: deps.operatorSettings,
    pdf: deps.adapters.pdf,
    payments: deps.adapters.payments,
    ...documentUrls(deps.env),
    paymentEffects: paymentEffects(),
    reportError: deps.reportError,
  });
}
