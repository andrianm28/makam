ALTER TABLE "bukti_pembayaran" ADD COLUMN "proof_key" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "harga_khusus_porsi_mitra" bigint;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "harga_khusus_porsi_mitra_catatan" text;--> statement-breakpoint
ALTER TABLE "pencairan_pembayaran" ADD COLUMN "dibayar_langsung_dibatalkan_pada" timestamp with time zone;