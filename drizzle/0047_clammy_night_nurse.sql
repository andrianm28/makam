ALTER TABLE "pemesanan_makam" ADD COLUMN "tumpang_jenis" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "pemesanan_induk_nomor" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_state" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_email" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_kode_hash" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_kode_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_salah" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_via" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_catatan" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_bukti_file_key" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_oleh" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "konsen_diputuskan_pada" timestamp with time zone;