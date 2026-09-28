import type { Database } from "@/db/client";
import { createBilling, type Billing, type PaymentEffect } from "@/domain/billing";
import { efekBuktiPembayaran } from "@/domain/notifications";
import { efekPencairanSaatLunas } from "@/domain/payouts/efek";
import type { OperatorSettings } from "@/domain/operator-settings";
import { documentPagePath } from "@/lib/document-links";
import type { RuntimeEnv } from "@/lib/env";
import type { ReportError } from "@/lib/observability/report-error";
import type { Adapters } from "@/ports";
import type { Clock } from "@/ports/clock";

/**
 * The downstream effects of a payment (spec, Billing: Bukti Pemesanan /
 * Perpanjangan, Pencairan due, Pekerjaan Layanan scheduled, Hak Pakai
 * extended or created). The modules that own them register them here, the one
 * registry both the `web` runtime and the worker's retry tick use. Built here:
 * Notifications' Bukti Pembayaran receipt email (ticket 20) and the Payouts
 * module's record of a settled payment, which is the Lunas half of the Saat Duka
 * Pencairan trigger (ticket 32).
 */
export function paymentEffects(deps: { clock: Clock; dokumenUrl: (link: string) => string }): readonly PaymentEffect[] {
  return [efekBuktiPembayaran({ clock: deps.clock, dokumenUrl: deps.dokumenUrl }), efekPencairanSaatLunas()];
}

/** Where a document's page lives: inside the container for the PdfRenderer, on the public site for payers. */
export function documentUrls(env: Pick<RuntimeEnv, "documentPageOrigin" | "APP_BASE_URL">) {
  const publicOrigin = new URL(env.APP_BASE_URL).origin;
  return {
    documentPageUrl: (link: string) => `${env.documentPageOrigin}${documentPagePath(link)}`,
    publicDocumentUrl: (link: string) => `${publicOrigin}${documentPagePath(link)}`,
    /** A Pemesanan Makam's own page, where a family follows its order (ticket 23). */
    pesananUrl: (nomor: string) => `${publicOrigin}/pesanan/${nomor}`,
    /**
     * The Pilih makam list a family is sent back to after a Tolak, carrying the
     * declined order's number: the page reads it, takes the rejecting Lokasi out
     * of the list and prefills the family's data (spec, Public site: "After a
     * Tolak, the Pilih makam list opens with a banner, the rejecting Lokasi
     * removed and the family's data prefilled"; ticket 24).
     */
    pesananUlangUrl: (nomor: string) => `${publicOrigin}/pesan-makam/saat-duka?dari=${encodeURIComponent(nomor)}`,
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
  const urls = documentUrls(deps.env);
  return createBilling({
    db: deps.db,
    clock: deps.adapters.clock,
    operatorSettings: deps.operatorSettings,
    pdf: deps.adapters.pdf,
    payments: deps.adapters.payments,
    ...urls,
    paymentEffects: paymentEffects({ clock: deps.adapters.clock, dokumenUrl: urls.publicDocumentUrl }),
    reportError: deps.reportError,
  });
}
