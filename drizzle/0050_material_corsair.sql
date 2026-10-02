CREATE TABLE "pekerjaan_layanan_tpu_bukti" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pekerjaan_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_key" text NOT NULL,
	"content_type" text NOT NULL,
	"taken_at" timestamp with time zone NOT NULL,
	"diunggah_oleh" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"diperbarui_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "mulai_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "bukti_dikirim_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "bukti_ditolak_alasan" text;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "bukti_ditunjukkan_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "selesai_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "jendela_ditutup_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "pencairan_item_id" uuid;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "pencairan_jatuh_tempo_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu" ADD COLUMN "kerja_ulang_dari_id" uuid;--> statement-breakpoint
ALTER TABLE "pekerjaan_layanan_tpu_bukti" ADD CONSTRAINT "pekerjaan_layanan_tpu_bukti_pekerjaan_id_pekerjaan_layanan_tpu_id_fk" FOREIGN KEY ("pekerjaan_id") REFERENCES "public"."pekerjaan_layanan_tpu"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pekerjaan_layanan_tpu_bukti_idx" ON "pekerjaan_layanan_tpu_bukti" USING btree ("pekerjaan_id","kind");