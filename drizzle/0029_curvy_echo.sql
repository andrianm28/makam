CREATE TABLE "antrean_bertugas" (
	"petugas_account_id" text PRIMARY KEY NOT NULL,
	"dinyalakan_pada" timestamp with time zone NOT NULL,
	"berakhir_pada" timestamp with time zone NOT NULL,
	"dimatikan_pada" timestamp with time zone,
	"alasan" text
);
--> statement-breakpoint
CREATE TABLE "antrean_peringatan" (
	"row_key" text NOT NULL,
	"tahap" integer NOT NULL,
	"dikirim_pada" timestamp with time zone NOT NULL,
	CONSTRAINT "antrean_peringatan_row_key_tahap_pk" PRIMARY KEY("row_key","tahap")
);
--> statement-breakpoint
ALTER TABLE "antrean_ambil" ADD COLUMN "subject_kind" text;--> statement-breakpoint
ALTER TABLE "catatan_internal" ADD COLUMN "oleh_platform" boolean DEFAULT false NOT NULL;