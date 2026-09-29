CREATE TABLE "pekerjaan_layanan_tpu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sumber" text NOT NULL,
	"nomor" text NOT NULL,
	"posisi" integer NOT NULL,
	"tagihan_id" text NOT NULL,
	"tpu_id" text NOT NULL,
	"tpu_name" text NOT NULL,
	"tpu_address" text NOT NULL,
	"makam" jsonb NOT NULL,
	"layanan_id" uuid NOT NULL,
	"layanan_variant_id" uuid NOT NULL,
	"label" text NOT NULL,
	"teks" text,
	"amount" bigint NOT NULL,
	"target_date" date NOT NULL,
	"status" text NOT NULL,
	"pemesan_account_id" text,
	"pemesan_name" text NOT NULL,
	"pemesan_email" text,
	"pemesan_phone" text,
	"dijadwalkan_at" timestamp with time zone,
	"dibatalkan_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pekerjaan_layanan_tpu_penugasan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"mitra_jasa_id" uuid NOT NULL,
	"ditugaskan_at" timestamp with time zone NOT NULL,
	"batas_jawab" timestamp with time zone NOT NULL,
	"dijawab_at" timestamp with time zone,
	"hasil" text NOT NULL,
	"alasan" text,
	"ditugaskan_oleh_account_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "layanan_hari_h" jsonb;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD CONSTRAINT "pekerjaan_layanan_tpu_layanan_id_layanan_layanan_id_fk" FOREIGN KEY ("layanan_id") REFERENCES "public"."layanan_layanan"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD CONSTRAINT "pekerjaan_layanan_tpu_layanan_variant_id_layanan_varian_id_fk" FOREIGN KEY ("layanan_variant_id") REFERENCES "public"."layanan_varian"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu_penugasan" ADD CONSTRAINT "pekerjaan_layanan_tpu_penugasan_pekerjaan_id_pekerjaan_layanan_tpu_id_fk" FOREIGN KEY ("pekerjaan_id") REFERENCES "public"."pekerjaan_layanan_tpu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu_penugasan" ADD CONSTRAINT "pekerjaan_layanan_tpu_penugasan_mitra_jasa_id_layanan_mitra_jasa_id_fk" FOREIGN KEY ("mitra_jasa_id") REFERENCES "public"."layanan_mitra_jasa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pekerjaan_layanan_tpu_posisi_idx" ON "pekerjaan_layanan_tpu" USING btree ("nomor","posisi");--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_tpu_status_idx" ON "pekerjaan_layanan_tpu" USING btree ("status","target_date");--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_tpu_tagihan_idx" ON "pekerjaan_layanan_tpu" USING btree ("tagihan_id");--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_tpu_pemesan_idx" ON "pekerjaan_layanan_tpu" USING btree ("pemesan_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pekerjaan_layanan_tpu_penugasan_terbuka_idx" ON "pekerjaan_layanan_tpu_penugasan" USING btree ("pekerjaan_id") WHERE "pekerjaan_layanan_tpu_penugasan"."hasil" in ('menunggu', 'diterima');--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_tpu_penugasan_mitra_idx" ON "pekerjaan_layanan_tpu_penugasan" USING btree ("mitra_jasa_id","ditugaskan_at");--> statement-breakpoint
CREATE INDEX "pekerjaan_layanan_tpu_penugasan_batas_idx" ON "pekerjaan_layanan_tpu_penugasan" USING btree ("hasil","batas_jawab");