CREATE TABLE "data_contoh_entri" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kode" text NOT NULL,
	"himpunan" text NOT NULL,
	"jenis" text NOT NULL,
	"entitas_id" text NOT NULL,
	"induk_kode" text,
	"selesai_pada" timestamp with time zone,
	"dicatat_pada" timestamp with time zone NOT NULL,
	"dicatat_oleh" text NOT NULL,
	"dicabut_pada" timestamp with time zone,
	"dicabut_oleh" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "data_contoh_entri_kode_aktif_idx" ON "data_contoh_entri" USING btree ("kode") WHERE "data_contoh_entri"."dicabut_pada" is null;--> statement-breakpoint
CREATE INDEX "data_contoh_entri_induk_idx" ON "data_contoh_entri" USING btree ("induk_kode");