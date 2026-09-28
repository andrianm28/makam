ALTER TABLE "tagihan" ADD COLUMN "pengembalian_diminta_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "pengembalian_jumlah" bigint;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "ditolak_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "alasan_tolak" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "dibatalkan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "alternatif_jenis_makam_id" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "alternatif_pemakaman_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "alternatif_ditawarkan_pada" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "tagihan_pengembalian_idx" ON "tagihan" USING btree ("pengembalian_diminta_at");--> statement-breakpoint
ALTER TABLE "tagihan" ADD CONSTRAINT "tagihan_pengembalian_check" CHECK (("tagihan"."pengembalian_diminta_at" is null) = ("tagihan"."pengembalian_jumlah" is null));