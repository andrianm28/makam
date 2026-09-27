/**
 * The Bukti Pembayaran effect (ticket 20): every payment path that makes a
 * Tagihan Lunas queues its receipt email through this Billing PaymentEffect,
 * in the same transaction. The effect learns no address from Billing, so it
 * reads back where the Tagihan's messages go (`tagihanTerbit` recorded it);
 * the worker's tick sends it. A Tagihan announced with no email logs the
 * receipt as `tanpa_email` instead (a receipt asks nothing: no call row).
 */
import { and, eq } from "drizzle-orm";
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
      const [kontak] = await tx
        .select()
        .from(notificationsTagihanKontak)
        .where(eq(notificationsTagihanKontak.tagihanId, payment.tagihanId));
      const [existing] = await tx
        .select({ id: notificationsMessage.id })
        .from(notificationsMessage)
        .where(
          and(
            eq(notificationsMessage.template, "bukti_pembayaran_terbit"),
            eq(notificationsMessage.tagihanId, payment.tagihanId),
          ),
        )
        .limit(1);
      if (existing) return;
      const now = deps.clock.now();
      if (!kontak?.email) {
        await tx.insert(notificationsMessage).values({
          template: "bukti_pembayaran_terbit",
          channel: "email",
          tagihanId: payment.tagihanId,
          nomorTagihan: kontak?.nomorTagihan ?? payment.nomorTagihan,
          nomorPemesanan: kontak?.nomorPemesanan ?? payment.nomorPemesanan,
          email: null,
          subject: `Bukti Pembayaran ${payment.nomorBukti}`,
          body: `Bukti Pembayaran ${payment.nomorBukti} untuk Tagihan ${payment.nomorTagihan}: CS membagikan tautannya dengan tangan.`,
          status: "tanpa_email",
          attempts: 0,
          sendAfter: now,
          sentAt: null,
          createdAt: now,
        });
        return;
      }
      const receipt = buktiPembayaranEmail({
        nomorBukti: payment.nomorBukti,
        nomorTagihan: kontak.nomorTagihan,
        nomorPemesanan: kontak.nomorPemesanan,
        total: kontak.total,
        paidAt: payment.paidAt,
        tautan: deps.dokumenUrl(kontak.tagihanLink),
      });
      await tx.insert(notificationsMessage).values({
        template: "bukti_pembayaran_terbit",
        channel: "email",
        tagihanId: payment.tagihanId,
        nomorTagihan: kontak.nomorTagihan,
        nomorPemesanan: kontak.nomorPemesanan,
        email: kontak.email,
        subject: receipt.subject,
        body: receipt.body,
        status: "menunggu",
        attempts: 0,
        sendAfter: payment.paidAt,
        sentAt: null,
        createdAt: now,
      });
    },
  };
}
