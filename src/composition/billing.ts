import type { Database } from "@/db/client";
import { createBilling, type Billing, type BillingDeps, type PaymentEffect } from "@/domain/billing";
import { efekBuktiPembayaran } from "@/domain/notifications";
import { efekBuktiPemesanan, type BuktiPemesananEffectDeps } from "@/domain/pemesanan";
import type { OperatorSettings } from "@/domain/operator-settings";
import { documentPagePath } from "@/lib/document-links";
import type { RuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
import type { Adapters } from "@/ports";
import type { Clock } from "@/ports/clock";

/** What Billing is composed from: the env, the database and the picked adapters. */
export interface BillingComposition {
  env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">;
  db: Database;
  adapters: Adapters;
  operatorSettings: Pick<OperatorSettings, "current">;
  reportError: ReportError;
}

/** The downstream effects of a payment (spec, Billing: Bukti Pemesanan / Perpanjangan, Pencairan due, Pekerjaan Layanan scheduled, Hak Pakai extended or created). The modules that own them register them here, the one registry both the `web` runtime and the worker's retry tick use. Built here: Notifications' Bukti Pembayaran receipt email (ticket 20) and the Pemesanan module's Bukti Pemesanan, which makes a paid order Selesai (ticket 25). */
export function paymentEffects(deps: {
  clock: Clock;
  dokumenUrl: (link: string) => string;
  /** The Pemesanan module's own effect (ticket 25), when a process composes that module beside Billing. */
  buktiPemesanan?: PaymentEffect;
}): readonly PaymentEffect[] {
  return [
    efekBuktiPembayaran({ clock: deps.clock, dokumenUrl: deps.dokumenUrl }),
    ...(deps.buktiPemesanan ? [deps.buktiPemesanan] : []),
  ];
}

/** Where a document's page lives: inside the container for the PdfRenderer, on the public site for payers. */
export function documentUrls(env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">) {
  const publicOrigin = new URL(env.APP_BASE_URL).origin;
  return {
    documentPageUrl: (link: string) => `${env.documentPageOrigin}${documentPagePath(link)}`,
    publicDocumentUrl: (link: string) => `${publicOrigin}${documentPagePath(link)}`,
    /** A Pemesanan Makam's own page, where a family follows its order (ticket 23). */
    pesananUrl: (nomor: string) => `${publicOrigin}/pesanan/${nomor}`,
  };
}

/** Billing's own dependency bundle for this composition, without the payment effects (which are built from it). */
function billingDeps(deps: BillingComposition, paymentEffects: readonly PaymentEffect[]): BillingDeps {
  const urls = documentUrls(deps.env);
  return {
    db: deps.db,
    clock: deps.adapters.clock,
    operatorSettings: deps.operatorSettings,
    pdf: deps.adapters.pdf,
    payments: deps.adapters.payments,
    ...urls,
    paymentEffects,
    reportError: deps.reportError,
  };
}

/**
 * Billing on a given database or open transaction, built from the same settings
 * the runtime's own Billing uses. A PaymentEffect of another module runs *inside*
 * the transaction that settles a Tagihan and has to issue a document there, which
 * is what Billing's `within` is for; this is how such an effect reaches that
 * `within` without holding a Billing that was built before the effect existed.
 * A caller that only reads (Notifications' Tagihan read) takes the same thing.
 */
export function billingOn(deps: BillingComposition, tx: Database): Billing {
  return createBilling({ ...billingDeps(deps, []), db: tx });
}

/** The Pemesanan module's Bukti Pemesanan effect, on a given payment transaction. */
export function buktiPemesananEffect(
  deps: Omit<BuktiPemesananEffectDeps, "billingOn"> & { compose: BillingComposition },
): PaymentEffect {
  const { compose, ...rest } = deps;
  return efekBuktiPemesanan({ ...rest, billingOn: (tx) => billingOn(compose, tx) });
}

/** Billing wired on one database: shared by the `web` runtime, its test twin, the CLIs and the worker's retry tick. */
export function composeBilling(deps: BillingComposition & { paymentEffects?: readonly PaymentEffect[] }): Billing {
  const urls = documentUrls(deps.env);
  return createBilling(
    billingDeps(deps, deps.paymentEffects ?? paymentEffects({ clock: deps.adapters.clock, dokumenUrl: urls.publicDocumentUrl })),
  );
}
