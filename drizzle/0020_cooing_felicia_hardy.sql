CREATE TABLE "katalog_lama_jenis_makam" (
	"kode" text PRIMARY KEY NOT NULL,
	"lokasi_kode" text NOT NULL,
	"jenis_makam_id" uuid,
	"diklaim_pada" timestamp with time zone NOT NULL,
	"diimpor_pada" timestamp with time zone,
	"diimpor_oleh" text
);
--> statement-breakpoint
CREATE TABLE "katalog_lama_lokasi" (
	"kode" text PRIMARY KEY NOT NULL,
	"lokasi_id" uuid,
	"diklaim_pada" timestamp with time zone NOT NULL,
	"diimpor_pada" timestamp with time zone,
	"diimpor_oleh" text
);
