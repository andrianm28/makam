ALTER TABLE "pesanan_layanan" ALTER COLUMN "hak_pakai_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "layanan" jsonb;