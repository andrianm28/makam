CREATE TABLE "pekerjaan_layanan_pesan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"jenis" text NOT NULL,
	"pengirim_account_id" text NOT NULL,
	"pengirim_peran" text NOT NULL,
	"pengirim_nama" text NOT NULL,
	"teks" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pekerjaan_layanan_pesan_lampiran" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pesan_id" uuid NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "jendela_ditutup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_pesan_lampiran" ADD CONSTRAINT "pekerjaan_layanan_pesan_lampiran_pesan_id_pekerjaan_layanan_pesan_id_fk" FOREIGN KEY ("pesan_id") REFERENCES "public"."pekerjaan_layanan_pesan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_pesan_pekerjaan_idx" ON "pekerjaan_layanan_pesan" USING btree ("pekerjaan_id","created_at");--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_pesan_lampiran_pesan_idx" ON "pekerjaan_layanan_pesan_lampiran" USING btree ("pesan_id");