ALTER TABLE "bukti_pembayaran" ADD COLUMN "proof_key" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "partner_share" bigint;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "partner_share_note" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "partner_share_oleh" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "partner_share_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "bayar_langsung_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "bayar_langsung_oleh" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "bayar_langsung_bukti" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD CONSTRAINT "pemesanan_makam_partner_share_check" CHECK ("pemesanan_makam"."partner_share" is null or "pemesanan_makam"."partner_share" between 0 and 100000000000);