CREATE TABLE "penilaian_layanan_tpu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"pemesan_account_id" uuid NOT NULL,
	"bintang" integer NOT NULL,
	"komentar" text,
	"dibuat_at" timestamp with time zone NOT NULL,
	CONSTRAINT "penilaian_layanan_tpu_bintang_check" CHECK ("penilaian_layanan_tpu"."bintang" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "penilaian_layanan_tpu" ADD CONSTRAINT "penilaian_layanan_tpu_pekerjaan_id_pekerjaan_layanan_tpu_id_fk" FOREIGN KEY ("pekerjaan_id") REFERENCES "public"."pekerjaan_layanan_tpu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "penilaian_layanan_tpu_pekerjaan_idx" ON "penilaian_layanan_tpu" USING btree ("pekerjaan_id");