import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { FakePaymentProvider, FakePdfRenderer } from "@/adapters/memory";
import type { Database } from "@/db/client";
import { createBilling, type BillingDeps, type PaymentEffect, type TagihanStatus } from "@/domain/billing";
import { pembayaranPerluDitinjau, tagihan as tagihanTable } from "@/domain/billing/schema";
import { createOperatorSettings } from "@/domain/operator-settings";
import type { Rupiah } from "@/lib/rupiah";
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
  /** Lowers an order's Pencairan by a Harga Khusus partner share (ticket 30); a test wires Payouts' own in through this. */
  kurangiPencairanPesanan?: BillingDeps["kurangiPencairanPesanan"];
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
    // Ticket 30: the manual and direct payment paths, and Harga Khusus, need these.
    audit: setup.audit,
    files: setup.files,
    kurangiPencairanPesanan: options.kurangiPencairanPesanan,
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

/**
 * Sets a Tagihan's status directly. A stand-in until Tidak Tertagih can be
 * declared (ticket 29, with Lewat Jatuh Tempo from the chasing rules): that
 * ticket replaces every use with its public functions.
 */
export async function setTagihanStatusForTest(db: Database, tagihanId: string, status: TagihanStatus): Promise<void> {
  await db.update(tagihanTable).set({ status }).where(eq(tagihanTable.id, tagihanId));
}

/**
 * Marks a Pembayaran Perlu Ditinjau resolved directly (deletes its row). A
 * stand-in for ticket 31 (Refunds), which resolves one for real (usually by
 * an approved refund) through its own public function: once that exists, the
 * Antrean's Tier 2 row for it needs no change to close, since it is a plain
 * projection of `billing.pembayaranPerluDitinjau()`.
 */
export async function resolvePembayaranPerluDitinjauForTest(db: Database, id: string): Promise<void> {
  await db.delete(pembayaranPerluDitinjau).where(eq(pembayaranPerluDitinjau.id, id));
}

/**
 * Inserts a Tagihan row directly with a total above the QRIS payment cap, to
 * exercise Bayar's defensive check against one that predates the cap:
 * `issueTagihan` and `reissueTagihan` already refuse a total above it, and an
 * issued Tagihan's total is immutable (the migration's trigger refuses any
 * change to it), so this is otherwise unreachable. A stand-in until a real
 * such Tagihan can no longer occur even in principle.
 */
export async function insertOverCapTagihanForTest(db: Database, total: number, now: Date): Promise<{ id: string; link: string }> {
  const link = randomBytes(32).toString("base64url");
  const [row] = await db
    .insert(tagihanTable)
    .values({
      nomor: `TGH/OVERCAP/${randomUUID()}`,
      link,
      kind: "pay_after",
      moment: { kind: "layanan" },
      issuedAt: now,
      dueAt: now,
      addresseeRole: "pemesan",
      addresseeName: "Overcap Test",
      addresseePhone: "+6281234567890",
      addresseeAccountId: null,
      nomorPemesanan: null,
      placeName: null,
      lineCount: 0,
      total: total as Rupiah,
      header: { legalName: "Test", address: "Test", phone: "000", email: "test@test.id" },
      replacesId: null,
      status: "belum_dibayar",
    })
    .returning({ id: tagihanTable.id });
  return { id: row.id, link };
}
