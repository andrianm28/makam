CREATE UNIQUE INDEX "notifications_message_tagihan_template_idx" ON "notifications_message" USING btree ("tagihan_id","template");--> statement-breakpoint
CREATE UNIQUE INDEX "notifications_telepon_pemesan_open_idx" ON "notifications_telepon_pemesan" USING btree ("subject_kind","subject_id") WHERE "notifications_telepon_pemesan"."ditutup_pada" is null;--> statement-breakpoint
-- contract: these copies of the Tagihan's own facts were never in a release (0017 is still on the ticket-20 branch); billing hands the Bukti effect the number, the amount and the link with the payment instead
ALTER TABLE "notifications_tagihan_kontak" DROP COLUMN "nomor_tagihan";--> statement-breakpoint
-- contract: as above, the Bukti effect reads the order number from the payment
ALTER TABLE "notifications_tagihan_kontak" DROP COLUMN "nomor_pemesanan";--> statement-breakpoint
-- contract: as above, the Bukti effect reads the settled amount from the payment
ALTER TABLE "notifications_tagihan_kontak" DROP COLUMN "total";--> statement-breakpoint
-- contract: as above, the Bukti effect reads the document link from the payment
ALTER TABLE "notifications_tagihan_kontak" DROP COLUMN "tagihan_link";
