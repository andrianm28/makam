CREATE TABLE "fieldwork_setor_retribusi" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tagihan_id" text NOT NULL,
	"nomor_tagihan" text NOT NULL,
	"amount" integer NOT NULL,
	"dibayarkan_pada" timestamp with time zone NOT NULL,
	"bukti_key" text NOT NULL,
	"dicatat_oleh" text NOT NULL,
	"dicatat_oleh_peran" text NOT NULL,
	"tugas_lapangan_id" uuid,
	"catatan" text,
	"dicatat_pada" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fieldwork_tugas" ADD COLUMN "tagihan_id" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "tagihan_nomor" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "pemakaman_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "kontak_tpu" jsonb;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "admin_platform_account_id" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "admin_platform_name" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "admin_platform_phone_number" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "harga" jsonb;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "catatan_konfirmasi" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "tpu_ditawarkan_id" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "tpu_ditawarkan_name" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "tpu_ditawarkan_address" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "alasan_tpu_ditawarkan" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "tpu_ditawarkan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "dikonfirmasi_pada" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "fieldwork_setor_retribusi_tagihan_idx" ON "fieldwork_setor_retribusi" USING btree ("tagihan_id");--> statement-breakpoint
CREATE INDEX "pengurusan_tpu_status_idx" ON "pengurusan_tpu" USING btree ("status");