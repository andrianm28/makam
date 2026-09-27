CREATE TABLE "pemesanan_makam" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"lokasi_id" text NOT NULL,
	"lokasi_name" text NOT NULL,
	"jenis_makam_id" text,
	"jenis_makam_name" text,
	"pemesan_account_id" text,
	"pemesan_name" text NOT NULL,
	"email" text,
	"phone_number" text,
	"almarhum_name" text NOT NULL,
	"tanggal_wafat" date NOT NULL,
	"rencana_pemakaman_at" timestamp with time zone,
	"keinginan_penempatan" text,
	"pemegang_hak" jsonb NOT NULL,
	"konfirmasi_due_at" timestamp with time zone,
	"tagihan_id" text,
	"alasan" text,
	"diajukan_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "pemesanan_makam_nomor_idx" ON "pemesanan_makam" USING btree ("nomor");--> statement-breakpoint
CREATE INDEX "pemesanan_makam_pemesan_idx" ON "pemesanan_makam" USING btree ("pemesan_account_id");--> statement-breakpoint
CREATE INDEX "pemesanan_makam_lokasi_idx" ON "pemesanan_makam" USING btree ("lokasi_id");