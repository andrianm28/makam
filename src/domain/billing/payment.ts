import { and, asc, desc, eq, gt, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { refusable } from "@/db/unit-of-work";
import type { OperatorSettings } from "@/domain/operator-settings";
import { InvalidWebhookError, type PaymentEvent, type PaymentProvider, type WebhookRequest } from "@/ports/payment-provider";
import { buktiById, type BuktiPembayaran } from "./documents";
import type { Rupiah } from "@/lib/rupiah";
import {
  buktiPembayaran,
  paymentWebhookEvent,
  pembayaranPerluDitinjau,
  providerPayment,
  tagihan as tagihanTable,
  type reviewReasons,
} from "./schema";
import { notPayableBecause, settleIn, type EffectDeps } from "./settlement";
import { currentHeader, documentLinkSchema, type DocumentHeader } from "./shared";

export interface BayarDeps {
  db: Database;
  payments: PaymentProvider;
  /** The public URL of a document's page, where the provider sends the payer back to. */
  publicDocumentUrl: (link: string) => string;
}

export type BayarResult =
  /** Send the payer to the provider's payment page. */
  | { ok: true; paymentUrl: string }
  | { ok: false; reason: "tidak_ditemukan" }
  /** Already paid: its Bukti Pembayaran (by link) is shown instead. */
  | { ok: false; reason: "sudah_lunas"; buktiLink: string }
  /** A Dibatalkan Tagihan (lapsed or replaced), or a pay-first one past its due date, can no longer be paid. */
  | { ok: false; reason: "tagihan_dibatalkan" | "batas_pembayaran_lewat" };

/**
 * A provider link is reused only while it has at least this long left, so a
 * payer is never sent to a page that expires while they are paying.
 */
const LINK_REUSE_MARGIN_MS = 5 * 60 * 1000;

/**
 * Bayar on a Tagihan's page (anyone holding its link): the provider payment
 * for it, created on the first click and reused while its link is valid; once
 * the link expired, a new one. The Tagihan's row lock serialises concurrent
 * clicks, so one Tagihan never has two live payments at once.
 */
export async function bayar(deps: BayarDeps, link: string, now: Date): Promise<BayarResult> {
  if (!documentLinkSchema.safeParse(link).success) return { ok: false, reason: "tidak_ditemukan" };
  return refusable<BayarResult>(deps.db, async (tx) => {
    const [row] = await tx.select().from(tagihanTable).where(eq(tagihanTable.link, link)).for("update");
    if (!row) return { ok: false, reason: "tidak_ditemukan" };
    const notPayable = notPayableBecause(row, now);
    if (notPayable === "sudah_lunas") {
      const [bukti] = await tx
        .select({ link: buktiPembayaran.link })
        .from(buktiPembayaran)
        .where(eq(buktiPembayaran.tagihanId, row.id))
        .orderBy(asc(buktiPembayaran.paidAt))
        .limit(1);
      return { ok: false, reason: "sudah_lunas", buktiLink: bukti.link };
    }
    if (notPayable) return { ok: false, reason: notPayable };

    const [valid] = await tx
      .select({ paymentUrl: providerPayment.paymentUrl })
      .from(providerPayment)
      .where(
        and(
          eq(providerPayment.tagihanId, row.id),
          gt(providerPayment.expiresAt, new Date(now.getTime() + LINK_REUSE_MARGIN_MS)),
        ),
      )
      .orderBy(desc(providerPayment.expiresAt))
      .limit(1);
    if (valid) return { ok: true, paymentUrl: valid.paymentUrl };

    const created = await deps.payments.createPayment({
      reference: row.nomor,
      amountRupiah: row.total,
      description: `Tagihan ${row.nomor} · Makam.co.id`,
      returnUrl: deps.publicDocumentUrl(row.link),
    });
    await tx.insert(providerPayment).values({
      tagihanId: row.id,
      providerPaymentId: created.providerPaymentId,
      paymentUrl: created.paymentUrl,
      amount: row.total,
      createdAt: now,
      expiresAt: created.expiresAt,
    });
    return { ok: true, paymentUrl: created.paymentUrl };
  });
}

/** Why a paid webhook needs a human: money arrived that Billing could not settle a Tagihan with. */
export type WebhookReviewReason = (typeof reviewReasons)[number];

export type PaymentWebhookResult =
  /** The Tagihan is now Lunas, with this Bukti Pembayaran. */
  | { ok: true; outcome: "lunas"; bukti: BuktiPembayaran }
  /** This event was processed before (a replay or duplicate delivery): nothing changed. */
  | { ok: true; outcome: "sudah_diproses" }
  /** Another event for the payment that already settled the Tagihan: nothing changed. */
  | { ok: true; outcome: "sudah_lunas" }
  /** Not a payment ("expired", "failed"): nothing to do; the Tagihan stays payable through Bayar. */
  | { ok: true; outcome: "diabaikan" }
  /** Money Billing could not settle a Tagihan with: nothing changed, and it was reported for Admin Platform. */
  | { ok: true; outcome: "perlu_ditinjau"; reason: WebhookReviewReason }
  /** The signature or payload does not check out: rejected. */
  | { ok: false; reason: "webhook_tidak_valid" };

export interface WebhookDeps extends EffectDeps {
  db: Database;
  payments: PaymentProvider;
  operatorSettings: Pick<OperatorSettings, "current">;
}

/** How a Bukti Pembayaran names the channel when the provider does not say. */
const UNNAMED_CHANNEL = "VA atau QRIS";

/**
 * A PaymentProvider webhook: verified and parsed by the provider port (a bad
 * signature is rejected), then processed exactly once per event id. A "paid"
 * event for a payment made through Bayar settles its Tagihan: Lunas, one
 * Bukti Pembayaran (the provider's payment id as its reference) and the
 * downstream effects, in one transaction with the record of the event, so a
 * failed attempt is processed again when the provider redelivers.
 */
export async function receivePaymentWebhook(deps: WebhookDeps, request: WebhookRequest, now: Date): Promise<PaymentWebhookResult> {
  let event: PaymentEvent;
  try {
    event = await deps.payments.parseWebhook(request);
  } catch (error) {
    if (error instanceof InvalidWebhookError) return { ok: false, reason: "webhook_tidak_valid" };
    throw error;
  }
  const header = await currentHeader(deps.operatorSettings);
  if (!header) throw new Error("Pengaturan Operator is missing: a Bukti Pembayaran cannot be issued");

  const result = await deps.db.transaction(async (tx): Promise<Acted | { outcome: "sudah_diproses" }> => {
    // Deliveries of one event queue here; the first records it, the rest find it recorded.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`billing.webhook:${event.eventId}`}))`);
    const [seen] = await tx
      .select({ eventId: paymentWebhookEvent.eventId })
      .from(paymentWebhookEvent)
      .where(eq(paymentWebhookEvent.eventId, event.eventId));
    if (seen) return { outcome: "sudah_diproses" };
    const acted = await actOn(tx, deps, event, header, now);
    await tx.insert(paymentWebhookEvent).values({
      eventId: event.eventId,
      kind: event.kind,
      providerPaymentId: event.providerPaymentId,
      receivedAt: now,
      outcome: acted.outcome,
    });
    return acted;
  });

  switch (result.outcome) {
    case "lunas":
      return { ok: true, outcome: "lunas", bukti: await buktiById(deps.db, result.buktiId) };
    case "perlu_ditinjau":
      deps.reportError?.(new Error(`Pembayaran Perlu Ditinjau: ${result.reason}`), {
        tags: { module: "billing", event: "pembayaran_perlu_ditinjau", reason: result.reason },
      });
      return { ok: true, outcome: "perlu_ditinjau", reason: result.reason };
    default:
      return { ok: true, outcome: result.outcome };
  }
}

type Acted =
  | { outcome: "lunas"; buktiId: string }
  | { outcome: "sudah_lunas" | "diabaikan" }
  | { outcome: "perlu_ditinjau"; reason: WebhookReviewReason };

async function actOn(tx: Database, deps: EffectDeps, event: PaymentEvent, header: DocumentHeader, now: Date): Promise<Acted> {
  if (event.kind !== "paid") return { outcome: "diabaikan" };
  const channel = event.channel?.trim().slice(0, 100) || null;
  // When the payer paid, as the provider reports it (never later than now).
  const paidAt = event.occurredAt < now ? event.occurredAt : now;
  const [payment] = await tx
    .select({ tagihanId: providerPayment.tagihanId, amount: providerPayment.amount })
    .from(providerPayment)
    .where(eq(providerPayment.providerPaymentId, event.providerPaymentId));

  /** Records a Pembayaran Perlu Ditinjau: the money stays unsettled for Admin Platform. */
  const review = async (reason: WebhookReviewReason): Promise<Acted> => {
    await tx.insert(pembayaranPerluDitinjau).values({
      reason,
      eventId: event.eventId,
      providerPaymentId: event.providerPaymentId,
      tagihanId: payment?.tagihanId ?? null,
      amount: event.amountRupiah as Rupiah,
      channel,
      paidAt,
      receivedAt: now,
    });
    return { outcome: "perlu_ditinjau", reason };
  };
  if (!payment) return review("pembayaran_tidak_dikenal");
  if (event.amountRupiah !== payment.amount) return review("jumlah_tidak_cocok");

  const settled = await settleIn(
    tx,
    deps,
    payment.tagihanId,
    {
      method: { kind: "penyedia_pembayaran", channel: channel ?? UNNAMED_CHANNEL },
      reference: event.providerPaymentId,
      header,
      paidAt,
    },
    now,
  );
  if (!settled.ok) {
    switch (settled.reason) {
      case "batas_pembayaran_lewat":
        return review("batas_pembayaran_lewat");
      case "tagihan_dibatalkan":
        return review("tagihan_dibatalkan");
      case "tidak_ditemukan":
        // provider_payment references its Tagihan, and a Tagihan is never deleted.
        throw new Error("The Tagihan of a provider payment is missing");
    }
  }
  if (settled.settled) return { outcome: "lunas", buktiId: settled.buktiId };
  return settled.reference === event.providerPaymentId ? { outcome: "sudah_lunas" } : review("sudah_lunas_dibayar_lagi");
}

/** A Pembayaran Perlu Ditinjau: money reported as paid that Billing could not settle a Tagihan with. */
export interface PembayaranPerluDitinjau {
  id: string;
  reason: WebhookReviewReason;
  providerPaymentId: string;
  /** Whole rupiah the provider reports as paid. */
  amount: Rupiah;
  channel: string | null;
  paidAt: Date;
  receivedAt: Date;
  /** The Tagihan it was for, when Billing knows it. */
  tagihan: { id: string; nomorTagihan: string } | null;
}

/** Every Pembayaran Perlu Ditinjau, oldest first. */
export async function listPembayaranPerluDitinjau(db: Database): Promise<PembayaranPerluDitinjau[]> {
  const rows = await db
    .select({ row: pembayaranPerluDitinjau, nomorTagihan: tagihanTable.nomor })
    .from(pembayaranPerluDitinjau)
    .leftJoin(tagihanTable, eq(tagihanTable.id, pembayaranPerluDitinjau.tagihanId))
    .orderBy(asc(pembayaranPerluDitinjau.receivedAt), asc(pembayaranPerluDitinjau.id));
  return rows.map(({ row, nomorTagihan }) => ({
    id: row.id,
    reason: row.reason,
    providerPaymentId: row.providerPaymentId,
    amount: row.amount,
    channel: row.channel,
    paidAt: row.paidAt,
    receivedAt: row.receivedAt,
    tagihan: row.tagihanId && nomorTagihan ? { id: row.tagihanId, nomorTagihan } : null,
  }));
}
