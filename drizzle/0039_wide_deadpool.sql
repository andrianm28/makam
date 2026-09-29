CREATE TABLE "antrean_bertugas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"mulai_at" timestamp with time zone NOT NULL,
	"selesai_at" timestamp with time zone,
	"selesai_oleh" text
);
--> statement-breakpoint
CREATE TABLE "antrean_peringatan" (
	"row_key" text PRIMARY KEY NOT NULL,
	"terlihat_at" timestamp with time zone NOT NULL,
	"pertama_jatuh_tempo_at" timestamp with time zone NOT NULL,
	"pertama_at" timestamp with time zone,
	"eskalasi_30_at" timestamp with time zone,
	"eskalasi_90_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "antrean_bertugas_satu_terbuka_per_akun" ON "antrean_bertugas" USING btree ("account_id") WHERE "antrean_bertugas"."selesai_at" is null;--> statement-breakpoint
CREATE INDEX "antrean_bertugas_akun_idx" ON "antrean_bertugas" USING btree ("account_id");