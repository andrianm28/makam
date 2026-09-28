/**
 * The Lunas half of the Saat Duka Pencairan trigger (spec, Billing > Payouts:
 * a Petak's tariff and a Biaya Pemakaman become due when the Tagihan is Lunas
 * **and** the Pemakaman is recorded; ticket 32).
 *
 * Billing hands every downstream effect the settled payment inside the very
 * transaction that made the Tagihan Lunas, and this one keeps exactly what it
 * was handed — the Tagihan's id, its order, the instant the money arrived and
 * how it was paid — so the trigger's first half is committed with the payment
 * and never has to read Billing back.
 *
 * It takes no dependencies at all, which is deliberate: Billing composes it
 * (`src/composition/billing.ts`) and the Payouts module composes *after* Billing
 * (it needs Billing to read a Tagihan and to number a Bukti Pencairan), so an
 * effect that needed the Payouts module would be a cycle. Writing the fact is
 * all this does; turning a pair of facts into transferable items is the tick's
 * work (`./index.ts`), which is also what makes the two halves arriveable in
 * either order.
 *
 * Idempotent: `tagihan_id` is the primary key, so a redelivered webhook, a
 * retried effect or a second settle of the same Tagihan leaves one row.
 */
import type { Database } from "@/db/client";
import type { PaymentEffect, PaymentMethod, SettledPayment } from "@/domain/billing";
import { pencairanPembayaran } from "./schema";

/** The effect's name, as a failure of it is recorded in Billing's own effect-failure table. */
export const NAMA_EFEK_PENCAIRAN = "payouts.pencairan_saat_lunas";

/** Records that one Tagihan's money has arrived, for the Pencairan trigger to act on. */
export function efekPencairanSaatLunas(): PaymentEffect {
  return {
    name: NAMA_EFEK_PENCAIRAN,
    async run(tx: Database, payment: SettledPayment): Promise<void> {
      await tx
        .insert(pencairanPembayaran)
        .values({
          tagihanId: payment.tagihanId,
          nomorPemesanan: payment.nomorPemesanan,
          dibayarPada: payment.paidAt,
          metode: payment.method as PaymentMethod,
        })
        .onConflictDoNothing();
    },
  };
}
