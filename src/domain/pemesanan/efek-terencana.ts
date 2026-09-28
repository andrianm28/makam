/**
 * The Lunas half of a Pemesanan Terencana's payment (ticket 37), as a Billing
 * payment effect.
 *
 * Billing hands every downstream effect the settled payment inside the very
 * transaction that made the Tagihan Lunas, and this one keeps exactly what it was
 * handed — the order's Nomor Pemesanan, its Tagihan, the instant the money arrived —
 * so the first half of the payment is committed with the payment and never has to
 * read Billing back.
 *
 * It takes no dependencies at all, and that is deliberate for the same reason
 * `payouts.pencairan_saat_lunas` takes none: Billing is composed **before** the
 * Pemesanan module (it hands out the Nomor Pemesanan), so an effect that needed
 * this module would be a cycle. Writing the fact is all this does; turning it into
 * the order's Hak Pakai and its Bukti Pemesanan is the tick's work (`./tick-terencana.ts`),
 * which is also what makes the payment's arrival order-independent.
 *
 * It ignores a payment for an order that is not a Terencana one (a Saat Duka order's
 * own effects are ticket 23's and 25's), and it takes no lock: a `SELECT … FOR UPDATE`
 * on a row the transaction has not written yet cannot see a concurrent one, so the
 * money is a fact the tick must read rather than a race this effect could lose.
 *
 * Idempotent: `nomor_pemesanan` is the primary key, so a redelivered webhook, a
 * retried effect or a second settle of the same Tagihan leaves one row.
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { PaymentEffect, SettledPayment } from "@/domain/billing";
import { pemesananTerencana, pemesananTerencanaPembayaran } from "./schema";

/** The effect's name, as a failure of it is recorded in Billing's own effect-failure table. */
export const NAMA_EFEK_TERENCANA = "pemesanan.terencana_saat_lunas";

/** A Nomor Pemesanan, `MKM-2026-000123`: the one series every order kind is numbered from. */
const nomorPemesanan = /^MKM-\d{4}-\d{6}$/;

/** Records that one Pemesanan Terencana's Tagihan's money has arrived, for its tick to act on. */
export function efekTerencanaSaatLunas(): PaymentEffect {
  return {
    name: NAMA_EFEK_TERENCANA,
    async run(tx: Database, payment: SettledPayment): Promise<void> {
      if (payment.nomorPemesanan === null || !nomorPemesanan.test(payment.nomorPemesanan)) return;
      // Only an order of this module's own kind: a Saat Duka order's payment is ticket 23's
      // and 25's business, and recording it here would leave a row no tick of ours reads.
      const [order] = await tx
        .select({ id: pemesananTerencana.id })
        .from(pemesananTerencana)
        .where(eq(pemesananTerencana.nomor, payment.nomorPemesanan))
        .limit(1);
      if (!order) return;
      await tx
        .insert(pemesananTerencanaPembayaran)
        .values({
          nomorPemesanan: payment.nomorPemesanan,
          tagihanId: payment.tagihanId,
          dibayarPada: payment.paidAt,
        })
        .onConflictDoNothing();
    },
  };
}
