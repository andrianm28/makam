import { FakePaymentProvider, FakePdfRenderer } from "@/adapters/memory";
import type { Database } from "@/db/client";
import { createBilling, type PaymentEffect } from "@/domain/billing";
import { createOperatorSettings } from "@/domain/operator-settings";
import { identityOnTestDatabase, signedInAdminPlatform } from "./identity";

/** Pengaturan Operator as Admin Platform would type it before launch (ticket 06). */
export const PENGATURAN_OPERATOR = {
  legalName: "PT Jaya Korpora Prima",
  address: "Jl. Contoh No. 1, Jakarta Selatan 12345",
  phone: "(021) 555-0101",
  email: "halo@makam.co.id",
  csWhatsApp: "0811-2222-3333",
  csReplyHours: "dibalas mulai pukul 06:00",
};

/** The document pages' origin in tests: the PdfRenderer is asked to open pages under it. */
export const TEST_DOCUMENT_ORIGIN = "http://127.0.0.1:3000";
/** The site's public origin in tests: where the PaymentProvider sends the payer back to. */
export const TEST_PUBLIC_ORIGIN = "https://makam.test";

export interface BillingTestOptions {
  /** The downstream effects of a payment, as later modules register them. */
  paymentEffects?: PaymentEffect[];
}

/**
 * The Billing module on the test Postgres with the fake Clock, the fake
 * PaymentProvider and the fake PdfRenderer, next to Pengaturan Operator
 * (whose values head every document). Errors Billing reports are kept in
 * `reportedErrors`.
 */
export function billingOnTestDatabase(db: Database, options: BillingTestOptions = {}) {
  const setup = identityOnTestDatabase(db);
  const operatorSettings = createOperatorSettings({ db, clock: setup.clock, audit: setup.audit });
  const pdf = new FakePdfRenderer();
  const payments = new FakePaymentProvider({ clock: setup.clock });
  const reportedErrors: { error: unknown; context: Record<string, unknown> }[] = [];
  const billing = createBilling({
    db,
    clock: setup.clock,
    operatorSettings,
    pdf,
    payments,
    documentPageUrl: (link) => `${TEST_DOCUMENT_ORIGIN}/dokumen/${link}`,
    publicDocumentUrl: (link) => `${TEST_PUBLIC_ORIGIN}/dokumen/${link}`,
    paymentEffects: options.paymentEffects,
    reportError: (error, context) => reportedErrors.push({ error, context }),
  });
  return { ...setup, operatorSettings, pdf, payments, reportedErrors, billing };
}

export type BillingSetup = ReturnType<typeof billingOnTestDatabase>;

/** Billing with Pengaturan Operator entered by the first Admin Platform (at the Clock's time). */
export async function billingWithOperatorSettings(db: Database, options: BillingTestOptions = {}) {
  const setup = billingOnTestDatabase(db, options);
  const { actor } = await signedInAdminPlatform(setup);
  const changed = await setup.operatorSettings.change(actor, { ...PENGATURAN_OPERATOR, reason: null });
  if (!changed.ok) throw new Error(`Pengaturan Operator refused: ${changed.reason}`);
  return { ...setup, adminPlatform: actor };
}
