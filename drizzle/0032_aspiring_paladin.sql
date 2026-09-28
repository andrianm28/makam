ALTER TABLE "bukti_pembayaran" ADD COLUMN "proof_key" text;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "harga_khusus_porsi_mitra" bigint;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "harga_khusus_porsi_mitra_catatan" text;--> statement-breakpoint
ALTER TABLE "pencairan_pembayaran" ADD COLUMN "dibayar_langsung_dibatalkan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_harga_khusus_porsi_mitra_check" CHECK ("tagihan"."harga_khusus_porsi_mitra" is null or "tagihan"."harga_khusus_porsi_mitra" between 0 and 100000000000);--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_harga_khusus_porsi_mitra_catatan_check" CHECK ("tagihan"."harga_khusus_porsi_mitra" is null or "tagihan"."harga_khusus_porsi_mitra" = 0 or "tagihan"."harga_khusus_porsi_mitra_catatan" is not null);