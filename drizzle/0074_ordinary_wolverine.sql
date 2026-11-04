CREATE TABLE "tariff_gambar_tipe_kavling" (
	"jenis_makam_id" uuid PRIMARY KEY NOT NULL,
	"file_key" text NOT NULL,
	"keterangan" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"updated_by_account_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tariff_gambar_tipe_kavling" ADD CONSTRAINT "tariff_gambar_tipe_kavling_jenis_makam_id_tariff_jenis_makam_id_fk" FOREIGN KEY ("jenis_makam_id") REFERENCES "public"."tariff_jenis_makam"("id") ON DELETE no action ON UPDATE no action;