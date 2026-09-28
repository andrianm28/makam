CREATE TABLE "bukti_pemesanan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nomor" text NOT NULL,
	"link" text NOT NULL,
	"tagihan_id" uuid NOT NULL,
	"pemesanan_id" text NOT NULL,
	"nomor_pemesanan" text NOT NULL,
	"lokasi_name" text NOT NULL,
	"petak_nomor" text NOT NULL,
	"pemegang_hak_name" text NOT NULL,
	"masa_mulai" date NOT NULL,
	"masa_selesai" date,
	"petunjuk_arah" text,
	"header" jsonb NOT NULL,
	"issued_at" timestamp with time zone NOT NULL,
	CONSTRAINT "bukti_pemesanan_nomor_unique" UNIQUE("nomor"),
	CONSTRAINT "bukti_pemesanan_link_unique" UNIQUE("link")
);
--> statement-breakpoint
ALTER TABLE "tagihan" ADD COLUMN "lewat_jatuh_tempo_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "dimakamkan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "pemakaman_tanggal" date;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "pemakaman_layer" integer;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "catat_pemakaman_ditagih_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "bukti_pemesanan_id" text;--> statement-breakpoint
ALTER TABLE "pemesanan_makam" ADD COLUMN "selesai_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bukti_pemesanan" ADD CONSTRAINT "bukti_pemesanan_tagihan_id_tagihan_id_fk" FOREIGN KEY ("tagihan_id") REFERENCES "public"."tagihan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bukti_pemesanan_pemesanan_idx" ON "bukti_pemesanan" USING btree ("pemesanan_id");--> statement-breakpoint
CREATE INDEX "tagihan_lewat_jatuh_tempo_idx" ON "tagihan" USING btree ("status","lewat_jatuh_tempo_at");