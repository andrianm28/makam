CREATE TABLE "pencairan_terencana" (
	"nomor_pemesanan" text PRIMARY KEY NOT NULL,
	"masa_pembatalan_berakhir_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bukti_pemesanan" ALTER COLUMN "masa_mulai" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "bukti_pemesanan" ADD COLUMN "masa_tahun" integer;--> statement-breakpoint
ALTER TABLE "inventory_hak_pakai" ADD COLUMN "syarat" jsonb;--> statement-breakpoint
ALTER TABLE "inventory_hak_pakai" ADD COLUMN "calon_penghuni" text;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "dikonfirmasi_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "tahan_sampai" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "ditolak_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "alasan_tolak" text;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "dibatalkan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "aktif_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "masa_pembatalan_berakhir_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana" ADD COLUMN "bukti_pemesanan_id" text;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana_unit" ADD COLUMN "tenure_years" integer;--> statement-breakpoint
ALTER TABLE "pemesanan_terencana_unit" ADD COLUMN "hak_pakai_id" uuid;