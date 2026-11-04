CREATE TABLE "lokasi_foto_galeri" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lokasi_id" uuid NOT NULL,
	"kategori" text NOT NULL,
	"keterangan" text NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by_account_id" text NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_by_account_id" text
);
--> statement-breakpoint
ALTER TABLE "lokasi_foto_galeri" ADD CONSTRAINT "lokasi_foto_galeri_lokasi_id_lokasi_mitra_id_fk" FOREIGN KEY ("lokasi_id") REFERENCES "public"."lokasi_mitra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lokasi_foto_galeri_lokasi_idx" ON "lokasi_foto_galeri" USING btree ("lokasi_id","created_at");