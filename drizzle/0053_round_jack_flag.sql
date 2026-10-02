CREATE TABLE "pekerjaan_layanan_pesan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"urutan" integer GENERATED ALWAYS AS IDENTITY (sequence name "pekerjaan_layanan_pesan_urutan_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sumber" text NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"pengirim" text NOT NULL,
	"pengirim_account_id" text NOT NULL,
	"teks" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pekerjaan_layanan_pesan_foto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pesan_id" uuid NOT NULL,
	"posisi" integer NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_pesan_foto" ADD CONSTRAINT "pekerjaan_layanan_pesan_foto_pesan_id_pekerjaan_layanan_pesan_id_fk" FOREIGN KEY ("pesan_id") REFERENCES "public"."pekerjaan_layanan_pesan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_pesan_pekerjaan_idx" ON "pekerjaan_layanan_pesan" USING btree ("pekerjaan_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "pekerjaan_layanan_pesan_foto_idx" ON "pekerjaan_layanan_pesan_foto" USING btree ("pesan_id","posisi");