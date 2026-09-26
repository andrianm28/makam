CREATE TABLE "lokasi_hari_libur_nasional" (
	"date" date PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "jam_operasional" jsonb;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "kontak_siaga_account_id" text;--> statement-breakpoint
ALTER TABLE "lokasi_mitra" ADD COLUMN "kontak_siaga_picked_at" timestamp with time zone;