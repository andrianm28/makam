CREATE TABLE "makam_tpu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tpu_id" text NOT NULL,
	"tpu_name" text NOT NULL,
	"blok_nomor" text NOT NULL,
	"blok_nomor_kunci" text NOT NULL,
	"almarhum" jsonb NOT NULL,
	"pemegang_hak" jsonb NOT NULL,
	"pemegang_account_id" text,
	"iptm_scan_key" text NOT NULL,
	"iptm_berlaku_sampai" date NOT NULL,
	"riwayat_iptm" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "dimakamkan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "dokumen_due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "dokumen_diunggah" jsonb;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "dokumen_lengkap_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "iptm_diajukan_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "iptm_terbit_pada" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "iptm_scan_key" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "iptm_berlaku_sampai" date;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "makam_tpu_id" text;--> statement-breakpoint
ALTER TABLE "pengurusan_tpu" ADD COLUMN "dibatalkan_pada" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "makam_tpu_tpu_blok_idx" ON "makam_tpu" USING btree ("tpu_id","blok_nomor_kunci");--> statement-breakpoint
CREATE INDEX "makam_tpu_pemegang_idx" ON "makam_tpu" USING btree ("pemegang_account_id");