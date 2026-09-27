/**
 * The Bukti Pembayaran effect (ticket 20): every payment path that makes a
 * Tagihan Lunas queues its receipt email through this Billing PaymentEffect,
 * in the same transaction. Billing hands the effect the Tagihan's number, the
 * amount settled and the document link, and the effect adds the one thing the
 * payment does not carry: where the receipt goes, read back from the address
 * recorded when the Tagihan was announced (`tagihanTerbit`). The worker's tick
 * sends it. A Tagihan announced with no email logs the receipt as
 * `tanpa_email` instead (a receipt asks nothing: no call row).
 */
import { eq } from "drizzle-orm";
import type { Database } from "@/db/client";
import type { PaymentEffect } from "@/domain/billing";
import type { Clock } from "@/ports/clock";
import { notificationsMessage, notificationsTagihanKontak } from "./schema";
import { buktiPembayaranEmail } from "./template";

export interface BuktiEffectDeps {
  clock: Clock;
  /** The Tagihan page's full URL from its link: it leads to the Bukti once the Tagihan is Lunas. */
  dokumenUrl: (link: string) => string;
}

/** Queues the Bukti Pembayaran email for a settled Tagihan. Idempotent: one Tagihan gets one receipt email. */
export function efekBuktiPembayaran(deps: BuktiEffectDeps): PaymentEffect {
  return {
    name: "notifications.bukti_pembayaran",
    async run(tx: Database, payment) {
      const now = deps.clock.now();
      const [kontak] = await tx
        .select({ email: notificationsTagihanKontak.email })
        .from(notificationsTagihanKontak)
        .where(eq(notificationsTagihanKontak.tagihanId, payment.tagihanId));
      if (!kontak?.email) {
        await tx
          .insert(notificationsMessage)
          .values({
            template: "bukti_pembayaran_terbit",
            channel: "email",
            tagihanId: payment.tagihanId,
            nomorTagihan: payment.nomorTagihan,
            nomorPemesanan: payment.nomorPemesanan,
            email: null,
            subject: `Bukti Pembayaran ${payment.nomorBukti}`,
            body: `Bukti Pembayaran ${payment.nomorBukti} untuk Tagihan ${payment.nomorTagihan}: CS membagikan tautannya dengan tangan.`,
            status: "tanpa_email",
            attempts: 0,
            sendAfter: now,
            sentAt: null,
            createdAt: now,
          })
          .onConflictDoNothing();
        return;
      }
      const receipt = buktiPembayaranEmail({
        nomorBukti: payment.nomorBukti,
        nomorTagihan: payment.nomorTagihan,
        nomorPemesanan: payment.nomorPemesanan,
        total: payment.total,
        paidAt: payment.paidAt,
        tautan: deps.dokumenUrl(payment.link),
      });
      // The same payment settling twice (a redelivered webhook, a retried
      // effect) leaves the family one receipt.
      await tx
        .insert(notificationsMessage)
        .values({
          template: "bukti_pembayaran_terbit",
          channel: "email",
          tagihanId: payment.tagihanId,
          nomorTagihan: payment.nomorTagihan,
          nomorPemesanan: payment.nomorPemesanan,
          email: kontak.email,
          subject: receipt.subject,
          body: receipt.body,
          status: "menunggu",
          attempts: 0,
          sendAfter: payment.paidAt,
          sentAt: null,
          createdAt: now,
        })
        .onConflictDoNothing();
    },
  };
}
